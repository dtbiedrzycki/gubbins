#!/usr/bin/env bats
#
# .githooks/reference-transaction: every local-branch update runs
# scripts/verify-signatures.sh over the commits it brings in.

load helper

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  KEY="$BATS_TEST_TMPDIR/key"
  new_signing_repo "$REPO" "$KEY"
  git -C "$REPO" config core.hooksPath "$HOOKS_DIR"
  cd "$REPO"
}

# Break caught: the hook rejecting legitimate updates (wrong range, or
# verifying against the wrong anchors).
@test "allows a fast-forward onto signed commits" {
  git branch -q behind
  commit_file "$REPO" a.txt
  git switch -q behind
  run git merge -q --ff-only main
  [ "$status" -eq 0 ]
  [ "$(git rev-parse behind)" = "$(git rev-parse main)" ]
}

# Break caught: the hook not running on merge/pull, or ignoring failure.
@test "blocks a fast-forward onto an unsigned commit" {
  local before bad
  before="$(git rev-parse main)"
  bad="$(unsigned_commit "$REPO" bad.txt)"
  run git merge -q --ff-only "$bad"
  [ "$status" -ne 0 ]
  [ "$(git rev-parse main)" = "$before" ]
}

# Break caught: the gap merge.verifySignatures left — `git fetch src:dst`
# moving a local branch with no check at all.
@test "blocks a fetch that writes an unsigned commit into a local branch" {
  local upstream="$BATS_TEST_TMPDIR/upstream" bad
  git clone -q "$REPO" "$upstream"
  bad="$(unsigned_commit "$upstream" bad.txt)"
  git -C "$upstream" branch -q side "$bad"
  run git fetch -q "$upstream" side:incoming
  [ "$status" -ne 0 ]
  run git rev-parse -q --verify refs/heads/incoming
  [ "$status" -ne 0 ]
}

# Break caught: the hook being over-broad and blocking plain fetches;
# commits are checked when they reach a local branch, not before.
@test "ignores remote-tracking refs" {
  local upstream="$BATS_TEST_TMPDIR/upstream" bad
  git clone -q "$REPO" "$upstream"
  bad="$(unsigned_commit "$upstream" bad.txt)"
  git -C "$upstream" branch -q side "$bad"
  run git fetch -q "$upstream" side:refs/remotes/upstream/side
  [ "$status" -eq 0 ]
  [ "$(git rev-parse refs/remotes/upstream/side)" = "$bad" ]
}

# Break caught: skipping updates whose old value is the null oid.
@test "blocks creating a branch at an unsigned commit" {
  local bad
  bad="$(unsigned_commit "$REPO" bad.txt)"
  run git branch new-branch "$bad"
  [ "$status" -ne 0 ]
  run git rev-parse -q --verify refs/heads/new-branch
  [ "$status" -ne 0 ]
}

# fetched_unsigned -> stdout: oid of an unsigned commit fetched into
#   refs/remotes/upstream/side, where (by design) nothing checked it.
fetched_unsigned() {
  local upstream="$BATS_TEST_TMPDIR/upstream" bad
  git clone -q "$REPO" "$upstream"
  bad="$(unsigned_commit "$upstream" bad.txt)"
  git -C "$upstream" branch -q side "$bad"
  git fetch -q "$upstream" side:refs/remotes/upstream/side
  printf '%s\n' "$bad"
}

# Break caught: a null old value treated as "new ref, skip what is on a
# remote" — remote-tracking refs are exactly the unchecked commits.
@test "blocks creating a branch from a fetched unsigned commit" {
  fetched_unsigned >/dev/null
  run git switch -q -c side upstream/side
  [ "$status" -ne 0 ]
  run git rev-parse -q --verify refs/heads/side
  [ "$status" -ne 0 ]
}

# Break caught: same, for an update that names no expected old value.
@test "blocks branch -f onto a fetched unsigned commit" {
  local before
  git branch -q other
  before="$(git rev-parse other)"
  fetched_unsigned >/dev/null
  run git branch -f other upstream/side
  [ "$status" -ne 0 ]
  [ "$(git rev-parse other)" = "$before" ]
}

# Break caught: the hook skipping ordinary commits on a branch.
@test "blocks an unsigned commit on a branch" {
  local before
  before="$(git rev-parse main)"
  echo x > x.txt && git add x.txt
  run git -c commit.gpgsign=false commit -q -m "unsigned" --no-verify
  [ "$status" -ne 0 ]
  [ "$(git rev-parse main)" = "$before" ]
}

# Break caught: deletions fed to the verifier and rejected.
@test "allows deleting a branch" {
  git branch -q doomed
  run git branch -q -D doomed
  [ "$status" -eq 0 ]
}

# Break caught: the hook checking only SSH signatures, which is what
# git's built-in merge.verifySignatures did with GitHub web-UI merges.
@test "allows moving a branch onto a commit PGP-signed by an anchored key" {
  command -v gpg >/dev/null || skip "gpg is not installed"
  local sha clone="$BATS_TEST_TMPDIR/clone"
  sha="$(pgp_fixture_sha)" || true
  [ -n "$sha" ] || skip "fixture commit not present in this clone"
  git clone -q --branch main "$REPO_ROOT" "$clone" 2>/dev/null || skip "cannot clone"
  cd "$clone"
  git config core.hooksPath "$HOOKS_DIR"
  git -c core.hooksPath=/dev/null branch -q probe "$sha~1"
  run git branch -f probe "$sha"
  [ "$status" -eq 0 ]
  [ "$(git rev-parse probe)" = "$sha" ]
}
