# 0021. Thank-you tracking stored outside rebuildProjections scope

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Thank-you tracking stored in a dedicated table outside `rebuildProjections` scope; not a ledger event

## Detail

**ADR-021 detail:** Modeling "thanked" as a ledger event (e.g., `ThankYouSent`) was considered and rejected under YAGNI — it's a simple boolean toggle with no policy logic, no invariant to protect, and no need to replay it; a plain mutable table outside the event-sourced/projection system is simpler and correctly excluded from `rebuildProjections`.
