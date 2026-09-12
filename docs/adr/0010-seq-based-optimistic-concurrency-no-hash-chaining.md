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

- **Hash chaining (each event linked to a hash of its predecessor)** —
  rejected: hash chaining verifies the integrity of an already-written
  history after the fact (detecting tampering or a missing link), which
  is a different problem than catching two writers racing to append the
  next event on the same stream right now. It would add hash computation
  and verification to every append without doing anything the
  `UNIQUE (itemId, seq)` constraint doesn't already do more directly —
  catching the conflict synchronously, at write time, via the database
  itself.

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
