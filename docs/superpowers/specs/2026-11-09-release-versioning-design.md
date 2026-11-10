# Release versioning and tracked migrations — design

**Date:** 2026-11-09
**Status:** Approved 2026-11-09

## Why

Gubbins now has a production database with real data in it. Production
runs a container built from `main` at `786f26b527a582ca2c86fa3b8a31473d290e8df9`.
Until now the whole schema lived in `0001_init.ts`, which was edited in place
41 times. Every table is created `IF NOT EXISTS` and the file reruns on each
startup. That worked while every database could be thrown away. It no longer
works. A column added to `0001_init` would never reach production, because the
table already exists. `assertSchemaMatches` would then stop the server and
tell the operator to delete the database.

At the same time there's no way to say which code is running. Every package
is `0.0.0` and there are no tags.

## Goals

1. Every schema change from now on ships as a new migration file. Each file
   runs exactly once per database and is never edited after it ships.
2. Releases have a version number and a git tag, and the running app shows its
   version in the footer.
3. A migration that fails leaves the database exactly as it was.

## Non-goals

- A 1.0.0 release. The project stays on `0.x` until the owner calls it launched.
- Down-migrations. ADR-0032 stays forward-only: rollback means restoring a
  backup.
- An app-taken backup before migrating. The owner ruled it out for now
  (2026-11-09). An earlier draft had one, but it clashed with the 30-day
  backup limit (ADR-0065), so it's deferred. Rollback is still restoring a
  backup (ADR-0032). Before deploying a release that bumps the minor number,
  the operator stops the container and copies `/data/wishlist.db` by hand,
  as ADR-0032's pre-upgrade backup (owner, 2026-11-09).
- Data migrations beyond what a schema change needs.
- More than one production instance, or migrating several databases.
- GitHub Releases pages, a changelog, release bots or commit-message
  conventions.
- A version in API URLs.

## Anti-goals (failure even if it works)

- Production's first startup on the new code changes or loses existing data.
- Any message, doc or script that tells an operator to delete the database.
- A failed migration leaving the database half-changed.

## Decisions (owner)

- **Releases are deliberate.** Merges pile up on `main`. The owner decides when
  to cut a release, builds the container from its tag and deploys it.
- **Version number:** semantic versioning on `0.x`. The first release is
  `v0.1.0`, tagged on `786f26b5` after the fact, because that is what
  production runs.
- **Bump rule:** a release that includes a migration or a new feature bumps the
  **minor** number (`0.1.0` → `0.2.0`). A release with only fixes bumps the
  **patch** number (`0.2.0` → `0.2.1`). The number alone tells the operator
  whether deploying it changes the database.
- **Where the version shows:** git tags `vX.Y.Z`, and the app footer next to
  the existing AGPL, Source and Privacy links.
- **No changelog** for now.
- **No app-taken backup** for now. Before a minor release the operator
  copies the database by hand. See Non-goals.
- **ADRs** stay editable in place through all `0.x` releases. The README's
  immutability rule applies from `1.0.0`.

## Design

### Migrations

- `apps/api/src/infrastructure/db/migrations/0001_init.ts` is frozen exactly as
  it is at `786f26b5`. New schema changes go in `0002_<name>.ts`,
  `0003_<name>.ts` and so on.
- `migrateToLatest` uses Kysely's `Migrator` (Kysely is already a dependency),
  so applied migrations are recorded in the database. Migrations are listed
  explicitly in code, not discovered from the filesystem, so the compiled
  `dist/` build and tests behave the same. *(builder may choose the provider
  shape)*
- **Adopting production.** Production has the `0001` tables but no record of
  applied migrations. On first startup the migrator treats `0001` as pending
  and runs it. Because every statement in `0001` is `IF NOT EXISTS`, that run
  changes nothing and simply records `0001` as applied. A test proves this: build a database at the `0001` schema
  with rows in it, with no migration record, then run `migrateToLatest`. The
  rows must survive and `0001` must be recorded.
- **`assertSchemaMatches`** keeps running after migrations. Its reference
  database must be built by running *all* migrations, not just `0001`'s `up`.
  Its error message must stop telling the operator to delete the database.
  Instead it should say that the schema doesn't match this build and that a
  migration is missing or was edited after release.
- **Pending migrations run in one transaction.** SQLite supports DDL inside
  transactions, but Kysely's SQLite adapter reports
  `supportsTransactionalDdl = false`. `createDb` tells the adapter it does,
  so the Migrator applies all pending migrations and their records in one
  transaction. A failure rolls back the whole batch, and the server exits
  non-zero. Production's `restart: unless-stopped` will retry, and each
  retry fails the same way against an unchanged database. *(my call)*
- Migrations run inside the existing startup path (`server.ts` calls
  `migrateToLatest`) and via `npm run migrate`, which is dev-only: the
  runtime image has no `tsx` or `src/`.
- **Production's starting point** (owner confirmed 2026-11-09): the production
  database was created fresh by the `786f26b5` build, so its constraints match
  `0001_init` as frozen.

### Version

- **One source:** the `version` field of the root `package.json`. Workspace
  `package.json`s get the same number at each bump so nothing disagrees.
- **Cutting a release** (documented in CONTRIBUTING.md): on an up-to-date
  `main`, bump all versions with one command, commit, tag `vX.Y.Z`, push the
  commit and the tag, then build the container from the tag. Before
  deploying a minor release, stop the container and copy the database. An npm script may
  wrap this. *(builder's call; plain `npm version` with workspaces is fine)*
- `v0.1.0`: tag `786f26b5` as `v0.1.0`. The first commit that sets
  `package.json` to `0.1.0` comes after that tag. That's acceptable, because
  `v0.1.0` is defined by its tag. The bump commit can land as part of this
  work, and the next release is `0.2.0`, since it adds the migration
  machinery.
- **Server:** reads its version at startup from `package.json` (present in the
  runtime image at `/app/package.json`) and adds `version` to the `/instance`
  response and its OpenAPI schema.
- **Footer:** shows `v<version>` alongside the existing links when `/instance`
  has loaded. With no instance data (server unreachable), it shows no version
  rather than a guessed one.

### Guard against editing shipped migrations

- A check fails when a migration file that exists at the latest `v*` tag
  differs from that tag's copy. It's a repo script run by the local gate
  (`verify.sh` in the verifying-gubbins-locally skill, which runs
  CI's checks). If there's no tag, it passes. *(builder's call on script
  language)*
- **The plan includes both follow-through steps**, so the guard can't ship
  without ever running:
  - Editing the skill's `verify.sh` (outside the repo) to call the script.
  - Handing the owner the
    `git tag -a v0.1.0 786f26b5 -m v0.1.0 && git push origin v0.1.0`
    command to run themselves.

### Docs

- New ADR 0085: versioning on `0.x` with the minor/patch rule, tags as the release
  record, and the version shown in the footer.
- ADR-0032 needs no change: rollback is still restoring a backup.
- Amend `docs/adr/README.md`: accepted ADRs may be amended in place until
  `1.0.0`.
- CONTRIBUTING.md: "Changing the schema" (new migration file, never edit a
  shipped one) and "Cutting a release".

## Testing (at the owning layer)

- Migrator: adopting a `0001`-schema database with data keeps the rows and
  records `0001`; a second run is a no-op.
- A migration that throws partway leaves no schema change and is not
  recorded as applied.
- `assertSchemaMatches` reference uses all migrations (an existing test may
  just need its fixture adjusted).
- `/instance` returns `version` (route test).
- Footer renders the version when present and nothing when absent (component
  test).
- Guard script: one test or self-check with a modified shipped migration.

## Left to the builder

- The migration provider's shape, the guard script's language
  and the release script, as marked above.
- PR split (max 10 files per PR, stack max 8).
- Wording of the footer version (`v0.2.0` is the expected form).
