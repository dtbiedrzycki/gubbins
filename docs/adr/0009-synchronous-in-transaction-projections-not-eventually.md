# 0009. Synchronous in-transaction projections, not eventually consistent

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Event-sourced ledger data
(ADR-[007](./0007-event-sourcing-for-the-ledger-only-audit-table-for-crud.md))
needs to be queryable efficiently — for hold expiry checks,
reconciliation views, and cross-item invariants like the concurrent-hold
cap — without replaying the full event log on every read. A choice was
needed between deriving those read models synchronously or asynchronously
(eventually consistent).

## Decision

We will write projections (`item_state`, `holds`, `contributions`) as
real tables updated synchronously, in the same transaction as the event
append, giving strongly consistent reads with no lag between an event
being recorded and its projection reflecting it
([data & persistence](../spec/data-and-persistence.md)).

## Alternatives considered

- **Eventually consistent projections, updated asynchronously after the
  event append (e.g., via a queue or background worker)** — rejected:
  introduces a new failure mode (projection lag or a stuck update) and a
  new infrastructure dependency (a queue/worker) for a single-container,
  self-hosted app that has deliberately kept to one periodic task and no
  external services; it would also reopen the TOCTOU race the
  concurrent-hold cap depends on being closed within one transaction
  ([backend architecture](../spec/backend-architecture.md)).

## Consequences

- Reads (hold status, reconciliation totals, the concurrent-hold cap
  check) are always correct as of the last committed event — no
  read-your-own-write surprises.
- Cross-item invariants can safely read a projection and append an event
  in the same `UnitOfWork` and rely on SQLite's single-writer transaction
  serialization to prevent a stale-read race
  ([backend architecture](../spec/backend-architecture.md),
  ADR-[046](./0046-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)).
- `rebuildProjections` (truncate and re-fold from events) remains
  available as a recovery path, since events remain the source of truth
  even though projections are also written synchronously.
