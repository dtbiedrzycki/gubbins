#!/usr/bin/env bash
#
# Verify that every commit in a range is signed by a key this repo trusts:
# an SSH key from .allowed_signers, or a PGP key from .allowed_pgp_keys.asc.
#
# Two anchors because two signers exist. Everything written here is
# SSH-signed. Merges made through GitHub's web UI are PGP-signed by
# GitHub's own key, which an SSH allowed-signers file cannot express.
#
# Forge-independent by design: it uses nothing but `git` and `gpg`, reads
# its trust anchors from the two committed files, needs no prior
# `git config`, keeps no keyring state, and works with no network. CI, the
# git hooks, and anyone auditing the history all run this same script.
#
# Usage:
#   scripts/verify-signatures.sh [<rev-range>]
#
#   <rev-range>  Anything `git rev-list` accepts. Default: HEAD (every
#               commit reachable from HEAD). An "A..B" range whose right
#               side is the all-zero object id (as git hooks pass for a
#               deleted ref) is a no-op; one whose left side is all-zero
#               (a newly created ref) is treated as "B and everything
#               not already on a remote".
#
# Exit status: 0 if all commits verify, 1 if any do not, 2 on setup error.

set -euo pipefail

root="$(git rev-parse --show-toplevel)"
allowed="$root/.allowed_signers"
allowed_pgp="$root/.allowed_pgp_keys.asc"

if [ ! -f "$allowed" ]; then
  echo "verify-signatures: trust anchor not found: $allowed" >&2
  exit 2
fi

# Import the PGP anchor into a throwaway keyring so `git` can check
# PGP-signed commits with the same --format='%G?' it uses for SSH ones.
# GNUPGHOME points into a temp dir, so this leaves no keyring in $HOME.
# Must end 0: bash takes the EXIT trap's last status as the script's own.
workdir=""
cleanup() {
  [ -n "$workdir" ] && rm -rf "$workdir"
  return 0
}
trap cleanup EXIT

if [ -f "$allowed_pgp" ] && command -v gpg >/dev/null 2>&1; then
  workdir="$(mktemp -d)"
  GNUPGHOME="$workdir/gnupg"
  export GNUPGHOME
  mkdir -p -m 700 "$GNUPGHOME"
  gpg --batch --quiet --import "$allowed_pgp" 2>/dev/null || true
  # The anchor file *is* the trust decision, so every key it carries is
  # ultimately trusted — otherwise a good signature reports U, not G.
  gpg --batch --with-colons --fingerprint 2>/dev/null \
    | awk -F: '/^fpr:/ { print $10 ":6:" }' \
    | gpg --batch --quiet --import-ownertrust 2>/dev/null || true
fi

range="${1:-HEAD}"

case "$range" in
  *..*)
    left="${range%%..*}"
    right="${range##*..}"
    if printf '%s' "$right" | grep -Eq '^0+$'; then
      echo "verify-signatures: ref deletion, nothing to verify"
      exit 0
    fi
    if printf '%s' "$left" | grep -Eq '^0+$'; then
      range="$right --not --remotes"
    fi
    ;;
esac

# shellcheck disable=SC2086
commits="$(git rev-list $range)"

if [ -z "$commits" ]; then
  echo "verify-signatures: no commits in range ($range)"
  exit 0
fi

rc=0
count=0
while IFS= read -r sha; do
  [ -n "$sha" ] || continue
  count=$((count + 1))
  gstat="$(git -c gpg.ssh.allowedSignersFile="$allowed" \
             log -1 --format='%G?' "$sha")"
  if [ "$gstat" != "G" ]; then
    echo "UNVERIFIED [$gstat] $(git log -1 --format='%h %an <%ae> — %s' "$sha")" >&2
    rc=1
  fi
done <<EOF
$commits
EOF

if [ "$rc" -eq 0 ]; then
  echo "verify-signatures: OK — $count commit(s) signed by a key in .allowed_signers"
else
  echo "verify-signatures: FAILED — commit(s) above are not signed by an allowed key" >&2
fi

exit "$rc"
