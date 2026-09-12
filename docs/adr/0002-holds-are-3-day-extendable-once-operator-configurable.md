# 0002. Holds are 3-day, extendable once, operator-configurable duration

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Claiming an item needs to place a temporary hold on it so other guests
don't also try to buy it while the claimant completes an offline
purchase, but the hold can't block the item forever if the guest never
follows through. Event timelines and operator expectations vary across
self-hosted deployments, so a single non-configurable duration would fit
some events and not others.

## Decision

We will make holds expire after `HOLD_DURATION_DAYS` (operator-configured,
default 3 days, [ops](../spec/ops.md)), extendable once for the same
additional duration, with expiry computed lazily (`now > expiresAt`)
rather than emitted by a background job.

## Alternatives considered

- **Fixed, non-configurable duration** — rejected: event timelines and
  operator expectations differ across self-hosted deployments, so one
  hardcoded value would be wrong for many of them.
- **Unlimited or repeatable extensions** — rejected: uncapped extensions
  would let a hold block an item indefinitely, defeating the purpose of a
  hold; capping to one extension bounds worst-case exposure at 2× the
  configured duration.
- **A separately configurable extension duration** — rejected: a second
  config knob adds operator-facing surface with no evidenced need beyond
  reusing the base duration.
- **Emitting expiry via a scheduled job** — rejected: lazy computation
  means a missed or failed scheduled run costs nothing (state is still
  correct on the next read); expiry as an emitted event would make hold
  correctness depend on that job actually firing.

## Consequences

- Maximum single-item exposure is bounded and known in advance: 2 ×
  `HOLD_DURATION_DAYS`.
- Operators can tune hold duration per deployment without a code change.
- Because expiry isn't emitted, no periodic job is required for
  hold-state correctness itself — the one periodic task the app does run
  ([holds](../spec/holds.md), ADR-[065](./0065-one-periodic-task-with-giver-email-purge-attached.md))
  exists for reminders and PII purge, not for expiring holds.
- Downstream reminder timing derives from `expiresAt`, so the same
  configurable duration flows through the reminder email without extra
  plumbing.
