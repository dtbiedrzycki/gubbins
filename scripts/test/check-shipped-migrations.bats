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

@test "passes with an edited migration when no release is tagged" {
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

@test "fails when a shipped migration is edited, naming the file and saying to add a new migration" {
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

@test "passes when index.ts, which lists every migration, changes after the tag" {
  echo "export const migrations = { a };" > "$DIR/index.ts"
  git add -A && git commit -q -m "add index"
  release
  echo "export const migrations = { a, b };" > "$DIR/index.ts"
  run "$GUARD"
  [ "$status" -eq 0 ]
}

@test "fails when a migration shipped in the newest tag is edited" {
  release
  echo "create table b" > "$DIR/0002_b.ts"
  git add -A && git commit -q -m "add 0002"
  git tag -a v0.2.0 -m v0.2.0
  echo "edited" >> "$DIR/0002_b.ts"
  run "$GUARD"
  [ "$status" -eq 1 ]
  [[ "$output" == *"v0.2.0"* ]]
}

@test "fails when run from a subdirectory" {
  release
  echo "edited" >> "$DIR/0001_init.ts"
  cd apps/api
  run "$GUARD"
  [ "$status" -eq 1 ]
}
