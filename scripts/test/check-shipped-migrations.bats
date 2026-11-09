#!/usr/bin/env bats
#
# scripts/check-shipped-migrations.sh: a migration in the latest release tag
# must be unchanged in the working tree.

load helper

GUARD="$REPO_ROOT/scripts/check-shipped-migrations.sh"
DIR=apps/api/src/infrastructure/db/migrations

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/$DIR"
  git -C "$REPO" init -q -b main
  git -C "$REPO" config user.name "Test"
  git -C "$REPO" config user.email "test@example.com"
  git -C "$REPO" config commit.gpgsign false
  git -C "$REPO" config tag.gpgsign false
  git -C "$REPO" config core.hooksPath /dev/null
  echo "create table a" > "$REPO/$DIR/0001_init.ts"
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m "root"
  cd "$REPO"
}

release() {
  git tag -a v0.1.0 -m v0.1.0
}

@test "passes when no release is tagged" {
  echo "edited" >> "$DIR/0001_init.ts"
  run "$GUARD"
  [ "$status" -eq 0 ]
}

@test "passes when a new migration is added after the tag" {
  release
  echo "create table b" > "$DIR/0002_b.ts"
  git add -A && git commit -q -m "add 0002"
  run "$GUARD"
  [ "$status" -eq 0 ]
}

@test "fails, naming the file, when a shipped migration is edited" {
  release
  echo "edited" >> "$DIR/0001_init.ts"
  run "$GUARD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"0001_init.ts"* ]]
  [[ "$output" == *"add a new migration instead"* ]]
}

@test "fails when a shipped migration is deleted" {
  release
  git rm -q "$DIR/0001_init.ts" && git commit -q -m "remove"
  run "$GUARD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"0001_init.ts"* ]]
}

@test "passes when a new migration is listed in the shipped index" {
  echo "export const migrations = { a };" > "$DIR/index.ts"
  git add -A && git commit -q -m "add index"
  release
  echo "create table b" > "$DIR/0002_b.ts"
  echo "export const migrations = { a, b };" > "$DIR/index.ts"
  run "$GUARD"
  [ "$status" -eq 0 ]
}
