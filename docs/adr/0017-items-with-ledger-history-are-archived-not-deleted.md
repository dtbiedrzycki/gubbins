# 0017. Items with ledger history are archived, not deleted

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Owners can remove items from their list, but the ledger (and the audit
table) is meant to be the durable record of what actually happened —
holds, purchases, and contributions an item accumulated. Deleting an
item outright would be destructive to the reconciliation and thank-you
records the owner still needs after the event, for any item that has
real history attached to it.

## Decision

We will archive (`archivedAt`) any item with any ledger history instead
of deleting it — this preserves the item and its full event history
while removing it from guest-facing views. Zero-history items (never
held or contributed to) may still be hard-deleted.

## Alternatives considered

- **Allowing hard delete with a confirmation warning, regardless of
  history** — rejected: the ledger and audit table are meant to be the
  durable record of what actually happened; a delete button that
  silently orphans events undermines that guarantee, no matter how
  clearly the confirmation warns about it.

## Consequences

- Owners lose the ability to fully remove an item once it has any
  history, and must use archive instead — the item stays in the
  database and out of guest-facing views rather than disappearing.
- Reconciliation and thank-you workflows can rely on every
  historically-claimed item still being present after the event, even if
  the owner archived it.
- This is the precedent ADR-[060](./0060-manual-contributions-are-voidable-not-editable.md)
  cites for rejecting hard delete of manual contributions: once
  something has ledger history, the system's answer is to preserve it
  and mark it (archived, voided) rather than remove it.
