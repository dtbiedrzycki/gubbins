# 0010. seq-based optimistic concurrency; no hash chaining

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Event streams are scoped per item
(ADR-[008](./0008-event-streams-scoped-per-item-not-per-list.md)), and
more than one guest can race to act on the same item concurrently (two
guests both trying to claim the last unit). A mechanism was needed to
detect a concurrent writer on the same stream so the losing write can
retry against fresh state, rather than silently corrupting or
overwriting it.

## Decision

We will use `seq`-based optimistic concurrency: every event append
specifies an `expectedSeq`, enforced by a `UNIQUE (itemId, seq)`
constraint; a losing writer's `EventStore.append` throws
`ConcurrencyError`, and the caller retries against fresh state and
re-evaluates the policy, capped at 3 attempts with jitter
([data & persistence](../spec/data-and-persistence.md),
[backend architecture](../spec/backend-architecture.md)). We will not
chain events by hash.

## Alternatives considered

- **Hash chaining (each event carrying a hash of its predecessor)** —
  rejected: a chain does provide something `seq` does not —
  tamper-evidence, since each event commits to its full prior history,
  so an edited, deleted, or reordered event breaks every later link. (It
  could also serve as the concurrency check via
  `UNIQUE (itemId, prevHash)`; `seq` is chosen for simplicity, not
  because a chain can't do the job.) But that property only matters
  against an actor who can write event rows directly, and in this system
  that actor is the operator (or someone holding the operator's data) —
  both out of scope per the
  [threat model](../spec/threat-model-summary.md). With no external
  anchor (a signed or published chain head), such an actor could simply
  recompute the chain anyway. Hashing every append would buy a guarantee
  the threat model doesn't ask for.

## Consequences

- A concurrent write is caught synchronously by the database's unique
  constraint and surfaced as `ConcurrencyError`, not discovered later by
  walking a hash chain.
- The retry path is bounded (3 attempts, jittered) rather than
  open-ended: a losing writer either succeeds against fresh state
  quickly or the failure surfaces to the caller.
- Because per-item ordering is enforced by `seq` rather than a hash link
  between events, `rebuildProjections`'s truncate-and-refold recovery
  path only needs each item's event order, which `seq` already provides
  — there is no chain to reconstruct or re-verify.
- The ledger is not tamper-evident against direct database writes: an
  edited payload, or a deleted event with `seq` values shifted to close
  the gap, is not detectable by the application. This is accepted under
  the threat model's explicit non-goal of protection against a hostile
  server operator. Revisit if a party other than the operator ever needs
  to verify ledger history (e.g. multi-tenant hosting, or guest-held
  receipts that could anchor a chain head).
