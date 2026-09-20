# 0033. Migrations are forward-only; rollback = restore from backup

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Migrations are forward-only; rollback = restore from pre-upgrade backup, not down-migrations; event schema evolution handled via an upcaster layer keyed on the existing `v` field

## Detail

**ADR-033 detail:** Down-migrations were considered and rejected — they're rarely exercised in practice, so a "tested" down-migration is often untested until the moment it's needed, which is the worst time to discover it's broken. Backup-then-forward-only is simpler and more honest about what's actually verified. The event `v` field plus an upcaster layer gives the same forward-only safety for event schema evolution as for relational migrations.
