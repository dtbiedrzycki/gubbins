#!/usr/bin/env bats

load helper

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO"
  git -C "$REPO" init -q -b main
  cd "$REPO"
}

@test "fails with a clear message when no identity is provided" {
  run env -u SIGNING_NAME -u SIGNING_EMAIL bash "$SETUP_SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"SIGNING_NAME"* ]]
  [[ "$output" == *"SIGNING_EMAIL"* ]]
}

@test "configures repo-local signing from env identity" {
  export SIGNING_NAME="Test Signer"
  export SIGNING_EMAIL="test@example.com"

  run bash "$SETUP_SCRIPT"
  [ "$status" -eq 0 ]

  [ -f "$REPO/.devcontainer/secrets/signing_ed25519" ]
  [ -f "$REPO/.devcontainer/secrets/signing_ed25519.pub" ]
  [ "$(git config --local commit.gpgsign)" = "true" ]
  [ "$(git config --local tag.gpgsign)" = "true" ]
  [ "$(git config --local gpg.format)" = "ssh" ]
  [ "$(git config --local core.hooksPath)" = ".githooks" ]
  # Verification on merge/pull is the reference-transaction hook's job.
  run git config --local --get merge.verifySignatures
  [ "$status" -eq 1 ]
  run git config --local --get pull.verifySignatures
  [ "$status" -eq 1 ]
  [ "$(git config --local user.email)" = "test@example.com" ]
  [ "$(git config --local gpg.ssh.allowedSignersFile)" = "$REPO/.allowed_signers" ]
  [ "$(grep -c 'test@example.com' "$REPO/.allowed_signers")" -eq 1 ]
}

# Break caught: clones set up before the reference-transaction hook keep
# merge/pull.verifySignatures, which rejects every GitHub web-UI merge.
@test "unsets merge/pull.verifySignatures left by an earlier setup" {
  export SIGNING_NAME="Test Signer"
  export SIGNING_EMAIL="test@example.com"
  git config --local merge.verifySignatures true
  git config --local pull.verifySignatures true

  run bash "$SETUP_SCRIPT"
  [ "$status" -eq 0 ]

  run git config --local --get merge.verifySignatures
  [ "$status" -eq 1 ]
  run git config --local --get pull.verifySignatures
  [ "$status" -eq 1 ]
}

@test "is idempotent: reuses the key and does not duplicate the trust line" {
  export SIGNING_NAME="Test Signer"
  export SIGNING_EMAIL="test@example.com"

  run bash "$SETUP_SCRIPT"
  [ "$status" -eq 0 ]
  fingerprint_before="$(ssh-keygen -lf "$REPO/.devcontainer/secrets/signing_ed25519.pub")"

  run bash "$SETUP_SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"reusing existing"* ]]
  [[ "$output" == *"already present in .allowed_signers"* ]]

  fingerprint_after="$(ssh-keygen -lf "$REPO/.devcontainer/secrets/signing_ed25519.pub")"
  [ "$fingerprint_before" = "$fingerprint_after" ]
  [ "$(grep -c 'test@example.com' "$REPO/.allowed_signers")" -eq 1 ]
}

@test "signs a real commit that verify-signatures.sh then accepts" {
  export SIGNING_NAME="Test Signer"
  export SIGNING_EMAIL="test@example.com"
  bash "$SETUP_SCRIPT"

  git add .allowed_signers
  git commit -q -m "root: trust anchor"
  echo hi > file.txt && git add file.txt && git commit -q -m "add file"

  run bash "$VERIFY_SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}
