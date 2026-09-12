# 0065. One periodic task, with giver-email purge attached

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

[Privacy](../spec/privacy.md) promised giver emails would be held only
for "the hold duration plus a short grace period," and
[domain model](../spec/domain-model.md) asserted the field was "already
time-limited," but no mechanism existed anywhere in the spec and the
grace period had no value — the promise was unimplementable as written.
Separately, a reminder job already existed (its last-run metric is
exposed in [observability](../spec/observability.md)) but its location
in the system was never stated.

## Decision

We will run exactly one periodic task (in-process, 15 min), with two
idempotent duties: sending hold-expiry reminders, and nulling giver
emails 7 days past `expiresAt`. No external cron, no new service
dependency. Additional scheduled jobs require an ADR.

## Alternatives considered

- **Lazy evaluation**, the pattern used for hold expiry
  ([holds](../spec/holds.md)) and rate-limit windows
  ([data & persistence](../spec/data-and-persistence.md)) — rejected:
  those work because something reads the row and can evaluate the
  predicate in passing. Nothing ever reads a stale giver email; that is
  precisely what makes it purgeable, and lazy evaluation cannot supply
  a purge with no reader.
- **Purging opportunistically on hold reads, as a supplement** —
  rejected as insufficient rather than wrong: the dominant case is a
  list nobody opens once the event has passed, which would hold
  addresses until `purgeAt` — an 87-day gap against the stated promise
  at the default `PURGE_AFTER_DAYS`.
- **Grace period as an operator-configurable env var** — rejected: the
  email's only consumer is the reminder, which fires before expiry, and
  the owner never sees the field at all —
  [owner dashboard](../spec/owner-dashboard.md)'s reconciliation and
  thank-you views show name, item, amount, method, state, source and
  date, never an address. After expiry the value has no use and no
  operator judgement attaches to how long it lingers. This follows
  ADR-[063](./0063-currency-validation-minor-unit-storage-and-the-ceiling.md)'s
  treatment of `MAX_CONTRIBUTION_MINOR`: a setting with no decision
  behind it is a constant, not configuration.

## Consequences

- Both duties are idempotent and neither is load-bearing for read
  correctness, preserving [holds](../spec/holds.md)'s stance that a
  failed run costs a missed email rather than a stuck item.
- Whole-list purge at `purgeAt` is the backstop, so the failure mode is
  delayed deletion, not indefinite retention.
- The task count is fixed at one, so a future implementer adding a
  second sweep has to justify it with a new ADR.
- A single predicate — `expiresAt + 7 days` — covers expired, released,
  and purchased holds alike, since all three carry an `expiresAt` that
  ages out on the same clock.
