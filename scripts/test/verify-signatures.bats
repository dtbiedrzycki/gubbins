#!/usr/bin/env bats

load helper

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  KEY="$BATS_TEST_TMPDIR/key"
  new_signing_repo "$REPO" "$KEY"
  cd "$REPO"
}

@test "passes for a fully signed history" {
  commit_file "$REPO" a.txt
  run bash "$VERIFY_SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OK"* ]]
}

@test "fails when a commit is unsigned" {
  commit_file "$REPO" a.txt --no-gpg-sign
  run bash "$VERIFY_SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"UNVERIFIED"* ]]
}

@test "fails when a commit is signed by a key not in .allowed_signers" {
  make_key "$BATS_TEST_TMPDIR/outsider" "Outsider"
  git config user.signingkey "$BATS_TEST_TMPDIR/outsider.pub"
  commit_file "$REPO" a.txt
  run bash "$VERIFY_SCRIPT"
  [ "$status" -eq 1 ]
}

@test "exit 2 when .allowed_signers is missing from the worktree" {
  rm -f "$REPO/.allowed_signers"
  run bash "$VERIFY_SCRIPT"
  [ "$status" -eq 2 ]
  [[ "$output" == *"trust anchor not found"* ]]
}

@test "an empty range is a pass" {
  run bash "$VERIFY_SCRIPT" "HEAD..HEAD"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no commits in range"* ]]
}

@test "a ref-deletion range (null right side) is a no-op pass" {
  run bash "$VERIFY_SCRIPT" "$(git rev-parse HEAD)..$ZERO_OID"
  [ "$status" -eq 0 ]
  [[ "$output" == *"deletion"* ]]
}

@test "a new-ref range (null left side) verifies reachable history" {
  commit_file "$REPO" a.txt
  run bash "$VERIFY_SCRIPT" "$ZERO_OID..$(git rev-parse HEAD)"
  [ "$status" -eq 0 ]
}

@test "a new-ref range still catches an unsigned ancestor" {
  commit_file "$REPO" a.txt --no-gpg-sign
  run bash "$VERIFY_SCRIPT" "$ZERO_OID..$(git rev-parse HEAD)"
  [ "$status" -eq 1 ]
}

@test "an explicit A..B range is honored, not widened" {
  commit_file "$REPO" a.txt              # HEAD~1 — signed
  commit_file "$REPO" b.txt --no-gpg-sign # HEAD   — unsigned
  run bash "$VERIFY_SCRIPT" "HEAD~2..HEAD~1"
  [ "$status" -eq 0 ]
}

# --- the PGP trust anchor (.allowed_pgp_keys.asc) ----------------------
#
# Signing a test commit with PGP would need a generated PGP key and a
# `gpg` that can create one, so these use this repository's own web-UI
# merge as the fixture instead. They skip where that commit is absent
# (shallow clone, or history rewritten) or `gpg` is not installed.

@test "accepts a commit PGP-signed by a key in .allowed_pgp_keys.asc" {
  command -v gpg >/dev/null || skip "gpg is not installed"
  local sha; sha="$(pgp_fixture_sha)" || true
  [ -n "$sha" ] || skip "fixture commit not present in this clone"
  cd "$REPO_ROOT"
  run bash "$VERIFY_SCRIPT" "$sha~1..$sha"
  [ "$status" -eq 0 ]
  [[ "$output" != *"UNVERIFIED"* ]]
}

@test "rejects that same commit when the PGP anchor carries no key" {
  command -v gpg >/dev/null || skip "gpg is not installed"
  local sha; sha="$(pgp_fixture_sha)" || true
  [ -n "$sha" ] || skip "fixture commit not present in this clone"
  local clone="$BATS_TEST_TMPDIR/clone"
  git clone -q --branch main "$REPO_ROOT" "$clone" 2>/dev/null || skip "cannot clone"
  : > "$clone/.allowed_pgp_keys.asc"
  cd "$clone"
  run bash "$VERIFY_SCRIPT" "$sha~1..$sha"
  [ "$status" -eq 1 ]
  [[ "$output" == *"UNVERIFIED"* ]]
}

@test "an SSH-only history is unaffected by the PGP anchor being absent" {
  [ ! -f "$REPO/.allowed_pgp_keys.asc" ]
  commit_file "$REPO" a.txt
  run bash "$VERIFY_SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" != *"UNVERIFIED"* ]]
}
