#!/usr/bin/env bash
#
# Verify that every commit in a range carries a good SSH signature made
# by a key listed in the committed .allowed_signers file.
#
# Forge-independent by design: it uses nothing but `git` and the
# in-repo .allowed_signers, needs no prior `git config`, and works with
# no network. CI, the git hooks, and anyone auditing the history all run
# this same script.
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

if [ ! -f "$allowed" ]; then
  echo "verify-signatures: trust anchor not found: $allowed" >&2
  exit 2
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
