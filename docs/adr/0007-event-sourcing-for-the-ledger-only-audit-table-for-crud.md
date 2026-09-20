# 0007. Event sourcing for the ledger only; audit table for CRUD metadata

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The ledger (holds, purchases, contributions) needs a strong audit trail,
replayability, and support for later corrections (voids, redactions)
without rewriting history — the kind of guarantee event sourcing
provides. The rest of the system's data (list/item metadata, settings)
is ordinary CRUD with no such requirements
([data & persistence](../spec/data-and-persistence.md)).

## Decision

We will use event sourcing only for the ledger — holds, purchases, and
contributions — and a separate plain audit table
`(entityId, field, oldValue, newValue, changedAt)` for CRUD metadata
changes elsewhere in the system. Ledger data is derived from an
append-only event log with real-table projections; CRUD metadata is
stored and audited conventionally and purged with a plain `DELETE`.

## Alternatives considered

- **Event-sourcing the entire system, including CRUD metadata** —
  rejected: nothing reads metadata history beyond a changelog, and the
  cost is concrete. Every item would carry event history from creation,
  breaking the rule that zero-history items may be hard-deleted
  (ADR-[017](./0017-items-with-ledger-history-are-archived-not-deleted.md));
  every metadata shape change would need an event upcaster as well as a
  migration
  (ADR-[032](./0032-migrations-are-forward-only-rollback-restore-from-backup.md));
  and every settings edit would pay for synchronous projections
  (ADR-[009](./0009-synchronous-in-transaction-projections-not-eventually.md))
  that merely copy the row. Neither purge nor personal data separates
  the two designs: whole-list purge deletes events too, and the audit
  table keeps old values just as an event log would.
- **Plain CRUD with row-level audit logging for the ledger too** —
  rejected: the ledger specifically needs append-only, replayable history
  to support later corrections (voids, redactions) without ever
  rewriting the historical record, which a mutable CRUD table with an
  audit log doesn't provide as cleanly.

## Consequences

- Ledger correctness is derived by replaying events into projections
  (`rebuildProjections`), giving a canonical, rebuildable source of truth
  for claims and money.
- The audit table's `oldValue`/`newValue` can hold personal data an
  owner typed into free text, such as an item description, which
  persists until whole-list purge at `purgeAt`, not until the field is
  next edited.
- **This is a load-bearing, foundational precedent.** Later decisions
  build directly on the ledger being event-sourced: the GDPR erasure
  design (ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))
  relies on ledger events referencing PII indirectly via `piiRef` rather
  than embedding it, and manual contributions being voidable-not-editable
  (ADR-[060](./0060-manual-contributions-are-voidable-not-editable.md))
  relies on the ledger's append-only, corrections-via-new-event model
  rather than mutating history.
