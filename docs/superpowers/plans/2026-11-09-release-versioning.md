# Release Versioning and Tracked Migrations Implementation Plan

> **As built:** PRs #206–#210 supersede this plan where they differ: pending migrations and their records run in one transaction through an adapter flag, not a wrapper per migration; the schema error says to deploy the release that last ran against the database; the guard checks only numbered `NNNN_*.ts` files (7 bats tests); the bump also regenerates `apps/api/openapi.json` (7 files); the release steps add `npm run gen:api` and a manual database copy before a minor release; and #210 is stacked on #205.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every schema change ships as a new migration file that runs once per database and in a transaction. Releases are tagged `0.x` versions, and the footer shows the running version.

**Architecture:** Kysely's `Migrator` with an explicit, in-code migration list replaces rerunning `0001_init` on each startup. A shell guard compares shipped migration files against the latest `v*` tag. The API reads its version from the root `package.json` (the existing `presentation/appVersion.ts`) and returns it from `/api/instance`, and the footer renders it.

**Tech Stack:** TypeScript, Kysely 0.29 + better-sqlite3, Fastify + zod, React + TanStack Query + msw, bats, npm workspaces (npm 11).

**Spec:** `docs/superpowers/specs/2026-11-09-release-versioning-design.md`

## Global Constraints

- `apps/api/src/infrastructure/db/migrations/0001_init.ts` must not change, byte for byte, from `786f26b5`.
- New migrations are named `NNNN_<snake_name>` (`0002_…`) and are listed in `migrations/index.ts` in order.
- Version is semver `0.x`. Tags are `vX.Y.Z`. All five `package.json` files carry the same version.
- No message, doc or script tells an operator to delete the database.
- No new runtime dependencies.
- Each PR is at most 10 changed files and is based on `main`. The tasks are independent, so this is not a stack.
- Test names and comments carry no plan or spec references. ADR numbers are fine.
- Run `verify.sh` (skill verifying-gubbins-locally) before every push, and `--e2e` before merging to `main`.

## Review Focus

1. **Production adoption:** a database with the `0001` tables and rows but no migration record keeps every row on first startup, and `0001_init` gets recorded. Covered in Task 2.
2. **A migration that throws partway** leaves no schema change and no record, so the restart loop retries against an unchanged database. Covered in Task 2.
3. **The compiled build finds `package.json`:** `appVersion.ts` resolves the root `package.json` from both `src/presentation` and `dist/presentation`, in the repo and in the runtime image. Checked by curling the built container in Task 5.
4. **A clone with no `v*` tags** (fresh, shallow or tags not fetched): the guard passes rather than failing every verify. Covered in Task 3.
5. **Server unreachable:** the footer shows no version rather than a stale or guessed one. Covered in Task 5.

---

### Task 1: Spec and plan PR

**Branch:** `docs/release-versioning` (exists; worktree `/workspace/.worktrees/release-versioning`)

**Files:** the spec and this plan (2 files).

- [ ] **Step 1:** Commit this plan, then push and open the PR (skill writing-pr-descriptions).

---

### Task 2: Track applied migrations and run each in a transaction

**Branch:** `feat/tracked-migrations`

**Files:**
- Create: `apps/api/src/infrastructure/db/migrations/index.ts`
- Create: `apps/api/src/infrastructure/db/runMigrations.ts`
- Create: `apps/api/src/infrastructure/db/runMigrations.integration.test.ts`
- Modify: `apps/api/src/infrastructure/db/migrate.ts` (`migrateToLatest` body, imports)
- Modify: `apps/api/src/infrastructure/db/assertSchemaMatches.ts` (reference build, doc comment, error message)
- Modify: `apps/api/src/infrastructure/db/schema.integration.test.ts` (the `migrateToLatest on a database an older build created` block)

**Interfaces:**
- Produces: `migrations: Record<string, Migration>` (`Migration` from `kysely`), currently `{ '0001_init': { up } }`.
- Produces: `runMigrations(db: Kysely<unknown>, list: Record<string, Migration> = migrations): Promise<void>`. It runs pending migrations in key order, each `up` inside `db.transaction()`, and throws the migrator's error if one fails.
- `migrateToLatest(db: Kysely<Database>): Promise<void>` keeps its signature. It becomes `runMigrations` followed by `assertSchemaMatches`.

- [ ] **Step 1: Write the failing tests** in `runMigrations.integration.test.ts`, each on a fresh `createDb(':memory:')`:
  - `runs a pending migration once, however often it is called`. Use a fake list `{ '0001_a': up that creates table t and inserts one row }`. Call it twice and expect `select count(*) from t` = 1.
  - `rolls back a migration that fails partway and does not record it`. Use a fake list `{ '0001_a': up that creates table t, then throws new Error('boom') }`. Expect a rejection matching `/boom/`, `pragma_table_info('t')` to be empty, and the `kysely_migration` rows to be `[]`.

  In `schema.integration.test.ts`, inside the `older build` describe:
  - `adopts a database the first release created, keeping its rows and recording 0001_init`. Create a fresh db, run `up` from `migrations/0001_init.js` directly (production's state: no migration record), and insert one wishlist. Then call `migrateToLatest`. Expect the wishlist row unchanged and `select name from kysely_migration` = `[{ name: '0001_init' }]`.
  - Change the existing `refuses to start, naming the table and how to recover` assertion to `/"event_log".*migration is missing/s` and add `.not.toThrow(/delete/i)` on the same promise.
- [ ] **Step 2: Run them and confirm they fail.** Run `bash ~/.claude/skills/verifying-gubbins-locally/verify.sh --quick apps/api src/infrastructure/db`. Expected: FAIL, because `runMigrations` doesn't exist and the message doesn't match.
- [ ] **Step 3: Implement `migrations/index.ts` and `runMigrations`.** Use `new Migrator({ db, provider: { getMigrations: async () => wrapped } })`, where `wrapped` maps each entry to `{ up: (mdb) => mdb.transaction().execute((trx) => m.up(trx)) }`. The wrapping is needed because Kysely's SQLite adapter reports `supportsTransactionalDdl = false`, so the Migrator never opens a transaction itself. Put that reason in a one-line comment. Call `migrateToLatest()` and `throw error` when `error` is set.
- [ ] **Step 4: Point `migrate.ts` and `assertSchemaMatches.ts` at `runMigrations`.**
  - `assertSchemaMatches` builds its reference with `runMigrations(reference)`.
  - Its doc comment drops "amended in place" and says the check catches a migration that is missing or was edited after release.
  - The message becomes: `Database schema doesn't match this build: table "${table}" has columns (…) but this build expects (…). A migration is missing, or one was edited after it was released. Restore from a backup rather than changing the database by hand.`
- [ ] **Step 5: Run the full API suite.** Run `bash ~/.claude/skills/verifying-gubbins-locally/verify.sh --quick apps/api`. Expected: PASS. All integration tests already go through `migrateToLatest`.
- [ ] **Step 6:** Confirm `git diff main -- apps/api/src/infrastructure/db/migrations/0001_init.ts` is empty. Run full `verify.sh`, commit, push and open the PR.

---

### Task 3: Guard against editing a shipped migration

**Branch:** `chore/shipped-migrations-guard`

**Files:**
- Create: `scripts/check-shipped-migrations.sh`
- Create: `scripts/test/check-shipped-migrations.bats`
- Outside the repo: `~/.claude/skills/verifying-gubbins-locally/verify.sh`

**Interfaces:**
- Produces: `scripts/check-shipped-migrations.sh`, which takes no arguments and runs from the repo root. It exits 0 when no `v*` tag is reachable from HEAD, or when every file under `apps/api/src/infrastructure/db/migrations/` at that tag matches the working tree. Otherwise it exits 1 and prints each changed or deleted path plus "shipped migrations are never edited; add a new migration instead". Core: `git describe --tags --abbrev=0 --match 'v*'`, then `git diff --exit-code --name-status <tag> -- <paths from git ls-tree -r --name-only <tag> <dir>>`.

- [ ] **Step 1: Write the failing bats tests.** Each test builds a temp repo whose root commit has `apps/api/src/infrastructure/db/migrations/0001_init.ts`. Reuse `helper.bash` where it fits.
  - `passes when no release is tagged`
  - `passes when a new migration is added after the tag`
  - `fails, naming the file, when a shipped migration is edited`: assert status 1 and output containing `0001_init.ts`.
  - `fails when a shipped migration is deleted`
- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx bats scripts/test/check-shipped-migrations.bats`. Expected: FAIL, because the script doesn't exist.
- [ ] **Step 3: Implement the script** (`set -euo pipefail`, executable bit set).
- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx bats scripts/test/check-shipped-migrations.bats`. Expected: 4 tests, 0 failures.
- [ ] **Step 5: Wire the guard into `verify.sh`.** Add `scripts/check-shipped-migrations.sh` right after the `python3 scripts/check_adr_links.py` line. This file is the owner's skill, outside the repo, so say so in the PR description.
- [ ] **Step 6:** Run full `verify.sh`, commit, push and open the PR. In the hand-off, give the owner this command to run themselves:
  `! git tag -a v0.1.0 786f26b527a582ca2c86fa3b8a31473d290e8df9 -m "v0.1.0" && git push origin v0.1.0`

---

### Task 4: Set every package to 0.1.0

**Branch:** `chore/version-0.1.0`

**Files:** `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared-types/package.json`, `packages/api-typegen/package.json`, `package-lock.json` (6 files).

- [ ] **Step 1:** In `apps/web/package.json`, change `"@gubbins/api-typegen": "^0.0.0"` to `"*"`, matching the other internal dependencies. `^0.0.0` matches only `0.0.0`, so the bump would otherwise send npm to the registry.
- [ ] **Step 2:** Run `npm version 0.1.0 --workspaces --include-workspace-root --no-git-tag-version`. Expected: all five `package.json` files report `0.1.0`, and the lockfile is updated.
- [ ] **Step 3:** Run `npm ci` (one at a time, per the memory note), then full `verify.sh`. Expected: PASS.
- [ ] **Step 4:** Commit, push and open the PR.

---

### Task 5: Show the running version in the footer

**Branch:** `feat/footer-version`

**Files:**
- Modify: `apps/api/src/presentation/instanceConfig.ts`
- Modify: `apps/api/src/presentation/instanceConfig.test.ts`
- Modify: `apps/api/src/presentation/routes.ts:131` (response description mentions the version)
- Modify: `apps/api/src/presentation/routes.integration.test.ts` (`GET /api/instance`)
- Regenerate: `apps/api/openapi.json` (`npm run gen:openapi -w apps/api`), `apps/web/src/api/schema.gen.ts` (`npm run gen:api-types -w apps/web`)
- Modify: `apps/web/src/features/instance/Footer.tsx`, `Footer.test.tsx`
- Modify fixtures: `apps/web/src/App.test.tsx:12`, `apps/web/src/pages/PrivacyPage.test.tsx:15,23` (add `version: '0.1.0'`)

That's 10 files.

**Interfaces:**
- Consumes: `appVersion: string` from the existing `presentation/appVersion.ts`, which reads the root `package.json` from both `src` and `dist`.
- `instanceResponseSchema` gains `version: z.string()`. `InstanceConfig`, `DEFAULT_INSTANCE_CONFIG` and `parseInstanceConfig`'s result gain `version: appVersion`. `parseInstanceConfig`'s signature is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `instanceConfig.test.ts`: `reports the release version`. Expect `parseInstanceConfig({}).version` to be `appVersion`.
  - `routes.integration.test.ts`: in the existing `GET /api/instance` test, pass `version: '9.9.9'` in the configured instance and expect it in the JSON.
  - `Footer.test.tsx`:
    - `shows the version the server is running`: mock `version: '0.2.0'` and expect `findByText('v0.2.0')`.
    - In the existing `falls back to the upstream repository…` test, add `expect(screen.queryByText(/^v\d/)).toBeNull()`.
- [ ] **Step 2: Run them and confirm they fail.** Run `verify.sh --quick apps/api src/presentation/instanceConfig.test.ts`, then `verify.sh --quick apps/web src/features/instance`. Expected: FAIL.
- [ ] **Step 3: Implement the API side, then regenerate** `openapi.json` and `schema.gen.ts`.
- [ ] **Step 4: Render the version in `Footer.tsx`.** When `data` is present, add a `' · '` separator followed by `v{data.version}` after the Privacy link, as plain text in the existing footer styling. Add `version` to the `App.test.tsx` and `PrivacyPage.test.tsx` fixtures.
- [ ] **Step 5:** Run full `verify.sh`. Expected: PASS.
- [ ] **Step 6: Check the compiled path.** Run `docker build -t gubbins:footer-version .`. Run it with `SESSION_COOKIE_SECRET=x`, then `curl -s localhost:3000/api/instance`. Expected: JSON with `"version":"<root package.json version>"`. Announce the container run to peer sessions first, per the memory note. Use the container IP if the port isn't reachable.
- [ ] **Step 7:** Commit, push and open the PR.

---

### Task 6: Document versioning and the schema rule

**Branch:** `docs/release-process`

**Files:**
- Create: `docs/adr/0086-releases-are-tagged-0x-versions-and-shipped-migrations-are-never-edited.md`. It takes 0086 because 0085 is reserved by the unmerged "I'm buying this" branch.
- Modify: `docs/adr/README.md` (the editable-until rule and the index row)
- Modify: `CONTRIBUTING.md` (two new sections)

**Content:**
- **ADR-0086** (from the template, dated 2026-11-09, Deciders `dtbiedrzycki`).
  - *Context:* production data since `786f26b5`, and `0001_init` edited in place 41 times.
  - *Decision:*
    - semver `0.x`, with v0.1.0 = `786f26b5`
    - minor = migration or feature, patch = fixes only
    - tags are the release record, and the footer shows the version
    - migrations are tracked by Kysely's Migrator, each runs in a transaction, and none is edited once shipped (enforced by `scripts/check-shipped-migrations.sh`)
  - *Alternatives:* starting at 1.0.0 (rejected, pre-release); a changelog or release bot (not needed yet); an app-taken backup before migrating (deferred, because it clashes with ADR-0065's 30-day limit).
  - *Consequences:* event payload shape changes now need a `v` bump and an upcaster (ADR-0032), not an in-place edit.
- **`docs/adr/README.md`:** "Until the first release" becomes "Until 1.0.0", and "After the first release" becomes "From 1.0.0". Add the 0086 index row. `scripts/check_adr_links.py` must pass.
- **CONTRIBUTING.md `## Changing the schema`:**
  - Add `migrations/NNNN_name.ts` and list it in `migrations/index.ts`.
  - Never edit a released migration. Fix it forward with a new one.
  - Event payload changes need a version bump and an upcaster.
  - A release with a migration bumps the minor number.
- **CONTRIBUTING.md `## Cutting a release`:**
  1. On a branch `release/vX.Y.Z` from up-to-date `main`, run `npm version <minor|patch> --workspaces --include-workspace-root --no-git-tag-version`.
  2. Open a PR and merge it.
  3. Run `git tag -a vX.Y.Z <merge commit> -m vX.Y.Z && git push origin vX.Y.Z`.
  4. Build the container from the tag.
  5. Rollback means restoring the database from backup and deploying the previous tag (ADR-0032).

- [ ] **Step 1:** Write the three files.
- [ ] **Step 2:** Run `python3 scripts/check_adr_links.py`. Expected: no errors. Then run full `verify.sh`.
- [ ] **Step 3:** Commit, push and open the PR.
