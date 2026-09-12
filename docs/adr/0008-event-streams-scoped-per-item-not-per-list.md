# 0008. Event streams scoped per item, not per list

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Given event sourcing for the ledger
(ADR-[007](./0007-event-sourcing-for-the-ledger-only-audit-table-for-crud.md)),
a scope had to be chosen for each event stream. The natural unit of
contention is a single item — that's what guests race to claim or
contribute to — while a list can contain many items being claimed
independently and concurrently by different guests.

## Decision

We will scope each event stream to a single item, not to the list as a
whole, with optimistic concurrency enforced via `UNIQUE (itemId, seq)`
and a global auto-increment `id` providing cross-stream ordering for
list-level views ([data & persistence](../spec/data-and-persistence.md)).

## Alternatives considered

- **One event stream per list** — rejected: would make every claim or
  contribution on any item in the list contend for the same stream's
  sequence number, serializing unrelated concurrent guest actions on
  different items and creating unnecessary write contention.

## Consequences

- Concurrent claims on different items in the same list never contend
  with each other; only concurrent actions on the same item do, which
  matches where real-world races actually occur (two guests claiming the
  same item).
- List-level views (e.g., overall progress) must aggregate across
  multiple per-item streams using the global auto-increment `id` for
  ordering, rather than reading one ordered stream.
- Later cross-item invariants — e.g., the per-session concurrent-hold cap
  (ADR-[048](./0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md))
  — must explicitly read list-wide projections inside a transaction
  rather than relying on stream ordering, since no single stream spans
  items ([backend architecture](../spec/backend-architecture.md)).
- This scoping is a precedent other decisions build on directly — e.g.
  ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s
  GDPR erasure design reasons about per-item event payloads carrying
  `piiRef` rather than embedding PII.
