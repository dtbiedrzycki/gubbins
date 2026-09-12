# 0032. Physical backup via VACUUM INTO, not raw file copy

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The database runs in SQLite WAL mode. A plain filesystem copy of the
`.db` file risks capturing an inconsistent snapshot unless the `.db`,
`-wal`, and `-shm` files are copied atomically together — easy for an
operator backup script to get wrong, and operators are exactly who has
to run this.

## Decision

We will perform physical backups via `VACUUM INTO <path>` against the
live database rather than a raw filesystem copy.

## Alternatives considered

- **Raw filesystem copy of the `.db` file** — rejected: under WAL mode
  this risks an inconsistent snapshot unless the `.db`, `-wal`, and
  `-shm` files are copied atomically together, which is easy for an
  operator script to get wrong.

## Consequences

- Physical backups are safe to run against a live database and produce
  one consistent, compacted snapshot file, at the cost of a brief write
  pause proportional to database size — acceptable at the project's
  target scale.
- Operator documentation must not present a plain filesystem copy as a
  supported backup method. See [backup, restore & upgrade
  safety](../spec/backup-restore-and-upgrade.md).
