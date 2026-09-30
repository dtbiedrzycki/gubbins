# 0007. Event sourcing for the ledger only; audit table for CRUD metadata

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The ledger (holds, purchases, contributions) needs a strong audit trail,
replayability, and support for later corrections (voids, redactions)
without rewriting history — the kind of guarantee event sourcing
provides. The rest of the system's data (list/item metadata, settings)
is owner-editable configuration, and a scope had to be chosen for how far
event sourcing extends.

Reads do not decide that scope: synchronous projections
(ADR-[009](./0009-synchronous-in-transaction-projections-not-eventually.md))
give every event-sourced area a latest-state cache regardless of how wide
it is. Purge does not decide it either: purge deletes the whole list at
`purgeAt` ([ops](../spec/ops.md), [privacy](../spec/privacy.md)), ledger
event rows included, so event-log immutability constrains what the
application may rewrite, not what may be physically deleted. Nor does
PII: the `piiRef` pattern
(ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))
keeps personal data out of payloads wherever it is applied, though at a
cost.

The costs that do decide it land on the write side and on long-term
schema evolution: every event type is a permanent contract under
ADR-[032](./0032-migrations-are-forward-only-rollback-restore-from-backup.md),
and an event is only worth that contract if it records something a plain
column cannot.

## Decision

We will use event sourcing only for the ledger — holds, purchases, and
contributions — and a separate plain audit table
`(entityId, field, oldValue, newValue, changedAt)` for CRUD metadata
changes elsewhere in the system. Ledger data is derived from an
append-only event log with real-table projections; CRUD metadata is
stored and audited conventionally.

A fact becomes a ledger event only if it passes **all three** of these
tests:

1. **A fold or a write-time policy reads it.** If nothing derives state
   from it and no command decides differently because of it, it is a
   column.
2. **A domain expert would name it as something that happened**, and
   would distinguish it from its siblings. `HoldReleased`,
   `ItemPurchased`, and derived expiry pass because an owner cares which
   one ended a hold. "The title was changed" does not.
3. **A reconciliation or dispute would ask about it.** The ledger exists
   so that later questions about claims and money can be answered from
   what happened, not from what a row looks like now.

A fact that fails any test stays a column, with an audit row where
history is wanted. Events are never CRUD-shaped: no `Created` /
`Updated` / `Deleted` verbs, no field-diff or whole-entity payloads, and
no fold that could be written as a generic reducer with no knowledge of
holds or money.

## Alternatives considered

- **Event-sourcing the entire system, including CRUD metadata, with
  projections as the latest-state cache** — rejected:
  - Every event type is a permanent contract. Under ADR-032 types are
    never redefined, only upcast. A CRUD column change is one forward
    migration; an event-payload change is an upcaster maintained for the
    life of the project, across roughly thirty owner-editable fields.
  - Metadata edits carry no intent. The result would be either an
    `ItemUpdated {changes}` event, which is the audit table under another
    name, or a family of per-field events each adding upcaster surface
    for no fold or policy that reads them.
  - Owner payment handles (IBAN, phone, email) would enter immutable
    payloads, requiring an owner-side equivalent of `piiRef` where a CRUD
    `UPDATE` suffices.
  - Hard deletes that are legitimate today, zero-history items
    (ADR-[017](./0017-items-with-ledger-history-are-archived-not-deleted.md))
    and `ManualGiftEntry`
    (ADR-[059](./0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)),
    would become marker events.
  - Cosmetic edits on the item stream would contend with guest holds
    under seq-based concurrency
    (ADR-[008](./0008-event-streams-scoped-per-item-not-per-list.md),
    ADR-[010](./0010-seq-based-optimistic-concurrency-no-hash-chaining.md))
    to protect no invariant.
- **Event-sourcing the policy-relevant item fields** (`quantity`,
  `targetMinor`, `type`, as e.g. `ItemQuantityChanged` /
  `ItemTargetChanged`) — deferred, not rejected. These pass test 2 and
  partly pass test 1: the hold and overfunding policies read them, though
  the fold does not. They fail test 3 today: no screen explains their
  history, and
  ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md)
  declined target history as premature. Contention with holds would be
  correct here rather than a cost, since an owner cutting quantity should
  serialise against a guest holding the last unit.
- **A list-level stream for key rotation, owner-token rotation, and
  reveal** — rejected: the state is a counter and nullable timestamps,
  nothing folds it, structured logging
  (ADR-[030](./0030-logging-metrics-tracing-standardized-on-pino-opentelemetry.md))
  already provides a security trail, and a second stream scope would cut
  across ADR-008 with no consumer.
- **Item lifecycle events** (`ItemArchived` / `ItemUnarchived`) —
  rejected: archiving is reversible, nothing folds it, and `archivedAt`
  plus an audit row records the same thing.
- **Plain CRUD with row-level audit logging for the ledger too** —
  rejected: the ledger specifically needs append-only, replayable history
  to support later corrections (voids, redactions) without ever
  rewriting the historical record, which a mutable CRUD table with an
  audit log doesn't provide as cleanly.

## Consequences

- Ledger correctness is derived by replaying events into projections
  (`rebuildProjections`), giving a canonical, rebuildable source of truth
  for claims and money.
- Purge is unaffected by stream scope. It remains a whole-list delete
  across every table, the event log included.
- The three tests are the review checklist for any ADR that proposes a
  new event type or moves a fact between CRUD and the ledger. Applying
  them to the existing events surfaced that two can be raised by either a
  guest or the owner with nothing recording which;
  ADR-[075](./0075-ledger-events-record-the-acting-role.md) addresses it.
- **The audit table is a derived change log, not a source of truth, and
  has no named consumer today.** No dashboard, export, or reconciliation
  view reads it. It stays as specified; the first spec change that reads
  it must name that consumer, and absent one a later ADR may drop it on
  the same YAGNI grounds as
  ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md)
  and
  ADR-[060](./0060-manual-contributions-are-voidable-not-editable.md).
  ADR-017's reference to it as part of the durable record should be read
  as secondary to the ledger, which is the durable record of claims and
  money.
- The audit table's `oldValue`/`newValue` can hold personal data an
  owner typed into free text, such as an item description, which
  persists until whole-list purge at `purgeAt`, not until the field is
  next edited.
- **Revisit trigger for the policy-relevant item fields:** the first
  dashboard or reconciliation screen that must explain a grandfathered
  over-commit
  (ADR-[019](./0019-quantity-may-drop-below-committed-holds-purchases.md))
  or an overfunded item caused by a target change (ADR-018). At that
  point those fields pass test 3 and should move onto the item stream as
  intent-bearing events. The audit table is not the extension point for
  that history.
- **This is a load-bearing, foundational precedent.** Later decisions
  build directly on the ledger being event-sourced: the GDPR erasure
  design (ADR-057) relies on ledger events referencing PII indirectly via
  `piiRef` rather than embedding it, and manual contributions being
  voidable-not-editable (ADR-060) relies on the ledger's append-only,
  corrections-via-new-event model rather than mutating history.
