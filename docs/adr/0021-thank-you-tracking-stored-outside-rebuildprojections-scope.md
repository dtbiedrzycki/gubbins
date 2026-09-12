# 0021. Thank-you tracking stored outside rebuildProjections scope

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The system is event-sourced: `rebuildProjections` truncates and re-folds
projection tables from the ledger, which is the source of truth
([data & persistence](../spec/data-and-persistence.md)). Thank-you tracking
needs somewhere to live, and it doesn't obviously fit that model — it's
owner bookkeeping ("did I send a thank-you for this"), not a fact the
system derives from claim/contribution events.

## Decision

We will store thank-you tracking (`thank_you_status`) in a dedicated
table outside `rebuildProjections` scope, not as a ledger event.

## Alternatives considered

- **Model "thanked" as a ledger event** (e.g. `ThankYouSent`) — rejected
  under YAGNI: it's a simple boolean toggle with no policy logic, no
  invariant to protect, and no need to replay it. A plain mutable table
  is simpler and is correctly excluded from `rebuildProjections`.

## Consequences

- `thank_you_status` must survive a `rebuildProjections` run untouched —
  a rebuild that truncated it would silently erase owner record-keeping
  that the event log never captured in the first place.
- This is the precedent later reused for `guest_pii` and
  `manual_gift_entries` ([data & persistence](../spec/data-and-persistence.md)): plain, owner/system bookkeeping tables
  outside the projection-rebuild scope, the same side-table pattern
  ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) and ADR-[061](./0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md) each apply for their own data.
