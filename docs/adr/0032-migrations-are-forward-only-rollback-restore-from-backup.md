# 0032. Migrations are forward-only; rollback = restore from backup

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Down-migrations are rarely exercised in practice, so a "tested"
down-migration is often untested until the moment it's actually
needed — the worst possible time to discover it's broken. The
event-sourced side of the system needed an equivalent forward-only story
for evolving event schemas over time, and the existing payload `v` field
was already available as a seam for that.

## Decision

We will make relational migrations forward-only, with rollback meaning
"restore from the pre-upgrade backup" rather than running a
down-migration; event schema evolution is handled the same way, via an
upcaster layer keyed on the existing event `v` field, with new event
types added only additively and existing types never redefined in
place.

## Alternatives considered

- **Writing and maintaining down-migrations** — rejected: down-migrations
  are rarely exercised, so a "tested" one is often untested until the
  moment it's needed — the worst time to discover it's broken;
  backup-then-forward-only is simpler and more honest about what's
  actually verified.

## Consequences

- Rollback is documented as a required pre-upgrade step (take a backup,
  restore it if the upgrade fails), not a code path the app maintains
  and tests separately.
- The event `v` field plus an upcaster layer
  (`infrastructure/events/upcasters/`) gives event schema evolution the
  same forward-only safety as relational migrations, and is the
  foundation later decisions build on — including how idempotent submit
  payloads get versioned (ADR-[048](./0048-hold-contribution-submits-carry-a-client-generated.md))
  and how erasure is handled across backups
  (ADR-[065](./0065-erasure-across-backups-and-the-subject-access-routing-fix.md)).
- CI runs every migration against a seeded copy of the prior schema
  version to catch failures pre-release. See [backup, restore & upgrade
  safety](../spec/backup-restore-and-upgrade.md).
