# 0086. Releases are tagged 0.x versions, and shipped migrations are never edited

- **Status:** Accepted
- **Date:** 2026-11-09
- **Deciders:** dtbiedrzycki

## Context

Production has held real data since 2026-11-09, running a build of `main`
at `786f26b5`. Until then every database could be thrown away, so the
whole schema lived in `0001_init`, which was edited in place 41 times and
rerun with `CREATE TABLE IF NOT EXISTS` on every start. On a database that
already exists, that silently skips every change. Nothing recorded which
code was running either: every package was `0.0.0`, and there were no tags.
The design is in the
[release versioning spec](../superpowers/specs/2026-11-09-release-versioning-design.md).

## Decision

We will version releases with semantic versioning on `0.x` until the owner
calls the project launched:

- `v0.1.0` is `786f26b5`, the build production first ran.
- A release that includes a migration or a new feature bumps the **minor**
  number. A release with only fixes bumps the **patch** number. The number
  alone tells an operator whether deploying it changes the database.
- A git tag `vX.Y.Z` on `main` is the release record. All `package.json`
  files carry the same version, and the footer shows the running one.
- Releases are cut deliberately. Merges pile up on `main` in between.

We will track migrations with Kysely's `Migrator`, listing them in code
(`infrastructure/db/migrations/index.ts`) and running each one in a
transaction. `0001_init` is frozen as the released baseline. A schema
change is a new migration file, and a migration that is in a release tag
is never edited: `scripts/check-shipped-migrations.sh` fails the local
gate when one is changed or deleted.

## Alternatives considered

- **Start at 1.0.0** — rejected: the project is pre-release, and `0.x`
  says the API and data shape may still change.
- **A changelog, release bot or commit-message convention** — not needed
  yet. Tags and PR history are enough for one owner.
- **The app copies the database before migrating** — deferred. One copy
  kept until the next release could outlive ADR-[065](0065-erasure-across-backups-and-the-subject-access-routing-fix.md)'s
  30-day backup limit. Rollback is still restoring a backup
  (ADR-[032](0032-migrations-are-forward-only-rollback-restore-from-backup.md)).

## Consequences

- An event payload shape change now needs a version bump and an upcaster
  (ADR-[032](0032-migrations-are-forward-only-rollback-restore-from-backup.md)).
  Editing the payload in place is no longer allowed.
- Accepted ADRs may still be amended in place through `0.x`, and become
  immutable from `1.0.0` ([ADR README](README.md)).
- Cutting a release is a short manual procedure in CONTRIBUTING.md. The
  release gate in the governance spec (image scans, SBOM) is still to come.
