#!/usr/bin/env bash
# Runs CI's checks locally, tuned for the dev container. Run it on a clean tree before pushing.
# Usage (from anywhere in the repo): scripts/verify.sh [--fast | --e2e | --quick <workspace> [vitest args]]
#   (none)   CI's docs-links and build jobs (link check, shipped-migration guard, builds, lint, bats,
#            every unit test) ("tests" level)
#   --e2e    the same plus the e2e suite ("e2e" level); run it before pushing to main or a PR into main
#   --fast   builds and lint only; records nothing
#   --quick <workspace> [vitest args]   rebuild shared-types, run only the given tests; records nothing
# Not covered: CI's container-smoke job (needs Docker) and its signature job (the repo's pre-push hook runs that).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if [ "${1:-}" = --quick ]; then
  ws=${2:?usage: verify.sh --quick <apps/api|apps/web|packages/shared-types> [vitest args]}; shift 2
  npm run build -w @gubbins/shared-types >/dev/null   # dist is git-ignored and stale after a branch switch
  cd "$ws" && exec npx vitest run --testTimeout=30000 "$@"
fi
case ${1:-} in "") level=tests ;; --e2e) level=e2e ;; --fast) level=fast ;; *) echo "verify: unknown option $1" >&2; exit 2 ;; esac

# Only a clean tree's result describes the commit, so only then is it recorded.
# The record (gubbins-verified in the git common dir) lets a pre-push hook you install yourself skip re-running checks.
clean=$([ -z "$(git status --porcelain --untracked-files=no)" ] && echo yes || echo no)
sha=$(git rev-parse HEAD)

python3 scripts/check_adr_links.py
scripts/check-shipped-migrations.sh
npm run build -w @gubbins/shared-types   # dist is git-ignored and stale after a branch switch
npm run build -w apps/api                # tsc: the only step that typechecks the tests
npm run build -w apps/web                # tsc --noEmit && vite build
npm run lint                             # every workspace, as CI does
if [ "$level" = fast ]; then echo "verify --fast: builds and lint passed (not recorded)"; exit 0; fi

npx bats scripts/test
npm run test -w @gubbins/shared-types
# Longer timeouts and fewer workers: the dev container is slow under load.
(cd apps/api && npx vitest run --dir src --testTimeout=30000)
(cd apps/web && npx vitest run --maxWorkers=2 --testTimeout=30000)
if [ "$level" = e2e ]; then npx playwright test --workers=1; fi   # 4 workers time out here under load

if [ "$clean" = yes ]; then
  echo "$sha $level" >> "$(git rev-parse --git-common-dir)/gubbins-verified"
  echo "verify: all $level-level checks passed for ${sha:0:7} (recorded; container smoke not run)"
else
  echo "verify: all $level-level checks passed, but tracked files had uncommitted changes, so nothing was recorded"
fi
