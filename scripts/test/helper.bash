# Shared helpers for the shell-script test suites.

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
VERIFY_SCRIPT="$REPO_ROOT/scripts/verify-signatures.sh"
SETUP_SCRIPT="$REPO_ROOT/scripts/setup-signing.sh"

ZERO_OID=0000000000000000000000000000000000000000

# make_key <path> <comment>
make_key() {
  ssh-keygen -q -t ed25519 -C "$2" -f "$1" -N ""
}

# allowed_line <email> <pubkey-file> <name>  -> stdout
allowed_line() {
  printf '%s namespaces="git" %s %s\n' "$1" "$(cut -d' ' -f1-2 < "$2")" "$3"
}

# new_signing_repo <repo-dir> <key-path>
#   Init a git repo configured to SSH-sign as test@example.com, with a
#   root commit that adds a .allowed_signers trusting that key.
new_signing_repo() {
  local dir="$1" key="$2"
  make_key "$key" "Test Signer"
  mkdir -p "$dir"
  git -C "$dir" init -q -b main
  git -C "$dir" config user.name "Test Signer"
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config gpg.format ssh
  git -C "$dir" config user.signingkey "$key.pub"
  git -C "$dir" config commit.gpgsign true
  git -C "$dir" config gpg.ssh.allowedSignersFile "$dir/.allowed_signers"
  allowed_line "test@example.com" "$key.pub" "Test Signer" > "$dir/.allowed_signers"
  git -C "$dir" add .allowed_signers
  git -C "$dir" commit -q -m "root: add allowed_signers"
}

# commit_file <repo-dir> <filename> [extra git-commit args...]
commit_file() {
  local dir="$1" name="$2"; shift 2
  echo "$name" > "$dir/$name"
  git -C "$dir" add "$name"
  git -C "$dir" commit -q -m "add $name" "$@"
}
