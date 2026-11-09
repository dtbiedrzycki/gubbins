#!/usr/bin/env bash
# Fails when a migration in the latest release tag differs from the working
# tree: a released migration has already run on someone's database, so a
# change to it never reaches them. Passes when no v* tag is reachable.
set -euo pipefail

dir=apps/api/src/infrastructure/db/migrations
tag=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null) || exit 0

mapfile -t shipped < <(git ls-tree -r --name-only "$tag" -- "$dir")
[ "${#shipped[@]}" -eq 0 ] && exit 0

if ! changed=$(git diff --name-status --exit-code "$tag" -- "${shipped[@]}"); then
  echo "Migrations released in $tag were changed:" >&2
  echo "$changed" >&2
  echo "Shipped migrations are never edited; add a new migration instead." >&2
  exit 1
fi
