# 0048. Hold/contribution submits carry a client-generated idempotency key

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

This is primarily an honest-guest double-submit guard rather than a
threat-model question. A guest on congested venue wifi taps "I've sent
it," waits, and taps again — producing two pledges against one payment, or
two holds where only the second confirmation screen (and therefore only
the second hold secret) is ever seen. Both outcomes land on the owner at
reconciliation time. Note the distinction from the existing
`ConcurrencyError` retry
([optimistic concurrency retry](../spec/data-and-persistence.md)): that is
a server-side retry against fresh state within one request; this
deduplicates two genuinely separate requests.

## Decision

We will have hold and contribution submits carry a client-generated
idempotency key, enforced by a uniqueness constraint on the existing
`holds` and `contributions` projection tables. `ItemHeld`,
`ContributionPledged`, and `ManualContributionRecorded` gain the
idempotency key, and `ItemHeld` additionally gains `sessionHash`
(ADR-[046](./0046-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)).
Keys are carried in the event payloads so `rebuildProjections`
reconstructs rather than silently drops the constraint.

## Alternatives considered

- **A separate idempotency table with its own lazy-expiry sweep** —
  rejected in favour of a uniqueness constraint on the existing
  projection tables: the projections are already written in the same
  transaction as the event append, so the constraint gets transactional
  correctness for free, and no new storage mechanism or expiry path is
  introduced.

## Consequences

- Duplicate submits from the same client are deduplicated transactionally,
  with no new storage mechanism to maintain.
- Under ADR-[032](./0032-migrations-are-forward-only-rollback-restore-from-backup.md),
  a payload change requires a `v` bump and an upcaster; as with
  ADR-[044](./0044-payment-methods-are-per-list-configuration-not-a-hardcoded.md)/[045](./0045-contribution-snapshots-its-payment-method-at-pledge-time.md),
  the project is pre-1.0 with no deployed instances and therefore no
  events in the wild, so these event shapes are amended in place. The
  upcaster discipline applies from the 1.0 tag onward.
- This mechanism does not address server-side concurrent-write races
  (that's the existing `ConcurrencyError` retry); it only covers
  client-side resubmission of the same logical request.
