# 0017. Items with ledger history are archived, not deleted

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Items with any ledger history are archived, not deleted; zero-history items may be hard-deleted

## Detail

**ADR-017 detail:** Deletion is destructive to reconciliation and thank-you records, both of which the owner needs after the event. Archiving (`archivedAt`) preserves the item and its full event history while removing it from guest-facing views. Rejected alternative: allowing hard delete with a confirmation warning — rejected because the ledger (and the audit table) are meant to be the durable record of what actually happened; a delete button that silently orphans events undermines that guarantee.
