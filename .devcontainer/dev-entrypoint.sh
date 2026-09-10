#!/bin/sh
#
# Container entrypoint for the dev image. Brings node_modules into sync
# with package-lock.json, then hands off to the container's command.
#
# It runs for BOTH start paths, because devcontainer.json sets
# "overrideCommand": false — so plain `docker compose up` and the Dev
# Containers flow share this one mechanism instead of each needing their
# own `npm ci` step.
#
# The sync is guarded: `npm ci` wipes and reinstalls node_modules every
# time it runs, so we only call it when the installed tree doesn't match
# the lockfile (npm writes node_modules/.package-lock.json as an exact
# copy of the lockfile it installed from — that's the comparison).

set -eu

cd /workspace

lock="package-lock.json"
installed="node_modules/.package-lock.json"

if [ -f "$lock" ]; then
  if [ -e node_modules ] && [ ! -w node_modules ]; then
    echo "dev-entrypoint: node_modules exists but is not writable by $(id -un)." >&2
    echo "dev-entrypoint: it's a pre-existing root-owned volume from before this" >&2
    echo "dev-entrypoint: image had the mount point chowned. Recreate it once:" >&2
    echo "dev-entrypoint:   docker compose down -v && docker compose up -d --build" >&2
    exit 1
  fi

  if [ ! -f "$installed" ] \
     || [ "$(sha256sum < "$lock")" != "$(sha256sum < "$installed" 2>/dev/null)" ]; then
    echo "dev-entrypoint: syncing dependencies (npm ci)..."
    npm ci
  else
    echo "dev-entrypoint: dependencies already match $lock, skipping npm ci"
  fi
else
  echo "dev-entrypoint: no $lock, skipping dependency install"
fi

exec "$@"
