# 0021. Thank-you tracking stored outside rebuildProjections scope

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Thank-you tracking stored in a dedicated table outside `rebuildProjections` scope; not a ledger event

## Detail

**ADR-021 detail:** Modeling "thanked" as a ledger event (e.g., `ThankYouSent`) was considered and rejected under YAGNI — it's a simple boolean toggle with no policy logic, no invariant to protect, and no need to replay it; a plain mutable table outside the event-sourced/projection system is simpler and correctly excluded from `rebuildProjections`.
