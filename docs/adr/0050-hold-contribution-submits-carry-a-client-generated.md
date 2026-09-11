# 0050. Hold/contribution submits carry a client-generated idempotency key

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Hold and contribution submits carry a client-generated idempotency key, enforced by a uniqueness constraint on the existing projections; primarily an honest-guest double-submit guard

## Detail

**ADR-050 detail:** This is the one item in its group that is not a threat-model
question. A guest on congested venue wifi taps "I've sent it," waits, and taps
again — producing two pledges against one payment, or two holds where only the
second confirmation screen (and therefore only the second hold secret) is ever
seen. Both outcomes land on the owner at reconciliation time. A separate
idempotency table with its own lazy-expiry sweep was considered and rejected in
favour of a uniqueness constraint on the existing `holds` and `contributions`
projection tables: the projections are already written in the same transaction
as the event append, so the constraint gets transactional correctness for free,
and no new storage mechanism or expiry path is introduced. Keys are carried in
the event payloads so `rebuildProjections` reconstructs rather than silently
drops the constraint. Note the distinction from the existing `ConcurrencyError`
retry (§[3.8](../spec/data-and-persistence.md)): that is a server-side retry against fresh state within one
request; this deduplicates two genuinely separate requests. `ItemHeld`,
`ContributionPledged`, and `ManualContributionRecorded` gain the idempotency
key, and `ItemHeld` additionally gains `sessionHash` (ADR-[048](./0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)). Under ADR-[033](./0033-migrations-are-forward-only-rollback-restore-from-backup.md) a
payload change requires a `v` bump and an upcaster; as with ADR-[046](./0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)/[047](./0047-contribution-snapshots-its-payment-method-at-pledge-time.md), the
project is pre-1.0 with no deployed instances and therefore no events in the
wild, so the shapes are amended in place. The upcaster discipline applies from
the 1.0 tag onward.
