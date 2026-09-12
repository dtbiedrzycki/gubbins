# 0007. Event sourcing for the ledger only; audit table for CRUD metadata

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The ledger (holds, purchases, contributions) needs a strong audit trail,
replayability, and support for later corrections (voids, redactions)
without rewriting history — the kind of guarantee event sourcing
provides. The rest of the system's data (list/item metadata, settings)
is ordinary CRUD with no such requirements, and forcing it through an
event store would add ceremony for no benefit while also complicating
purge, which needs to remain a plain `DELETE`
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
  rejected: metadata edits (list/item details, settings) have no replay,
  audit-immutability, or correction need beyond a simple changelog, and
  forcing them through an event store complicates purge (which must
  remain a plain `DELETE`) for no benefit.
- **Plain CRUD with row-level audit logging for the ledger too** —
  rejected: the ledger specifically needs append-only, replayable history
  to support later corrections (voids, redactions) without ever
  rewriting the historical record, which a mutable CRUD table with an
  audit log doesn't provide as cleanly.

## Consequences

- Ledger correctness is derived by replaying events into projections
  (`rebuildProjections`), giving a canonical, rebuildable source of truth
  for claims and money.
- CRUD metadata purge stays simple (a `DELETE`), unencumbered by
  event-log immutability concerns.
- **This is a load-bearing, foundational precedent.** Later decisions
  build directly on the ledger being event-sourced: the GDPR erasure
  design (ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))
  relies on ledger events referencing PII indirectly via `piiRef` rather
  than embedding it, and manual contributions being voidable-not-editable
  (ADR-[062](./0062-manual-contributions-are-voidable-not-editable.md))
  relies on the ledger's append-only, corrections-via-new-event model
  rather than mutating history.
