#!/usr/bin/env bash
#
# Configure SSH commit signing for this clone. Idempotent — safe to run
# again after a container rebuild or a fresh checkout.
#
# Identity is NOT hard-coded. It comes from, in order of precedence:
#   1. SIGNING_NAME / SIGNING_EMAIL already in the environment
#   2. .devcontainer/secrets/signing.env  (git-ignored; copy it from
#      signing.env.example and fill it in)
#
# What it does:
#   - generates a passphrase-less ed25519 signing key under
#     .devcontainer/secrets/ if one isn't there yet
#   - adds this identity to the committed .allowed_signers (if missing)
#   - sets repo-local git config to sign every commit/tag and to use the
#     repo's .githooks/ (whose reference-transaction hook verifies what
#     every merge, pull and other branch update brings in)
#   - prints the public key for you to share / register
#
# It never touches global git config and never sends anything anywhere.

set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

secrets_dir=".devcontainer/secrets"
env_file="$secrets_dir/signing.env"
key_file="$secrets_dir/signing_ed25519"
pub_file="$key_file.pub"
allowed="$root/.allowed_signers"

mkdir -p "$secrets_dir"
chmod 700 "$secrets_dir"

# --- identity -------------------------------------------------------------
if [ -f "$env_file" ]; then
  # shellcheck disable=SC1090
  if ! . "$env_file"; then
    echo "setup-signing: could not parse $env_file" >&2
    echo "setup-signing: quote the values, e.g. SIGNING_NAME=\"Your Name\"" >&2
    exit 1
  fi
fi

if [ -z "${SIGNING_NAME:-}" ] || [ -z "${SIGNING_EMAIL:-}" ]; then
  cat >&2 <<'MSG'
setup-signing: SIGNING_NAME and SIGNING_EMAIL are required.

  cp .devcontainer/secrets/signing.env.example .devcontainer/secrets/signing.env
  # then edit signing.env

or export SIGNING_NAME / SIGNING_EMAIL in your environment, and re-run.
MSG
  exit 1
fi

# --- signing key --------------------------------------------------------
if [ ! -f "$key_file" ]; then
  echo "setup-signing: generating $key_file"
  ssh-keygen -t ed25519 -C "$SIGNING_NAME" -f "$key_file" -N "" >/dev/null
else
  echo "setup-signing: reusing existing $key_file"
fi
chmod 600 "$key_file"
chmod 644 "$pub_file"

pub_line_key="$(cut -d' ' -f1-2 < "$pub_file")"

# --- trust anchor: .allowed_signers -----------------------------------
touch "$allowed"
entry="$SIGNING_EMAIL namespaces=\"git\" $pub_line_key $SIGNING_NAME"
if grep -qF "$pub_line_key" "$allowed"; then
  echo "setup-signing: key already present in .allowed_signers"
else
  printf '%s\n' "$entry" >> "$allowed"
  echo "setup-signing: added this identity to .allowed_signers (commit it)"
fi

# --- repo-local git config ------------------------------------------
git config --local user.name "$SIGNING_NAME"
git config --local user.email "$SIGNING_EMAIL"
git config --local gpg.format ssh
git config --local user.signingkey "$root/$pub_file"
git config --local commit.gpgsign true
git config --local tag.gpgsign true
git config --local gpg.ssh.allowedSignersFile "$allowed"
git config --local core.hooksPath .githooks
# Superseded by .githooks/reference-transaction: git's built-in check
# reads only the tip and only SSH-verifies here, so it rejected every
# GitHub web-UI merge (PGP-signed). Unset so re-running migrates a clone.
git config --local --unset-all merge.verifySignatures || true
git config --local --unset-all pull.verifySignatures || true

echo "setup-signing: git config set (repo-local)"
echo
echo "Public key for $SIGNING_NAME <$SIGNING_EMAIL>:"
echo "  $(cat "$pub_file")"
echo
echo "Registering it with a forge is optional — verification is offline"
echo "against .allowed_signers. For a GitHub 'Verified' badge, add it at"
echo "https://github.com/settings/ssh/new as a 'Signing Key'."
