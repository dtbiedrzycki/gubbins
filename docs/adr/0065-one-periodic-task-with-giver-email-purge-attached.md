# 0065. One periodic task, with giver-email purge attached

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

The app runs exactly one periodic task (in-process, 15 min), with two idempotent duties: sending hold-expiry reminders and nulling giver emails 7 days past `expiresAt`. Email purge cannot be lazy because nothing reads a stale email. The grace period is a fixed constant, not operator config, since the email's only consumer fires before expiry. Additional scheduled jobs require an ADR

## Detail

**ADR-065 detail:** §[3.7](../spec/privacy.md) promised giver emails would be held only for
"the hold duration plus a short grace period," and §[2](../spec/domain-model.md) asserted the field
was "already time-limited," but no mechanism existed anywhere in the
spec and the grace period had no value. The promise was unimplementable
as written.

Lazy evaluation — the pattern used for hold expiry (§[3.3](../spec/holds.md)) and rate-limit
windows (§[3.8](../spec/data-and-persistence.md)) — cannot supply it. Those work because something reads
the row and can evaluate the predicate in passing. Nothing ever reads a
stale giver email; that is precisely what makes it purgeable. Purging
opportunistically on hold reads was considered as a supplement and
rejected as insufficient rather than wrong: the dominant case is a list
nobody opens once the event has passed, which would hold addresses until
`purgeAt` — an 87-day gap against the stated promise at the default
`PURGE_AFTER_DAYS`.

The reminder job already existed (its last-run metric is exposed in
§[3.19](../spec/observability.md)) but its location was never stated. This ADR states it: one
in-process periodic task, no external cron, no new service dependency —
and fixes the count at one, so a future implementer adding a second
sweep has to justify it. Both duties are idempotent and neither is
load-bearing for read correctness, preserving §[3.3](../spec/holds.md)'s stance that a
failed run costs a missed email rather than a stuck item. Whole-list
purge at `purgeAt` is the backstop, so the failure mode is delayed
deletion, not indefinite retention.

The grace period is a fixed 7 days rather than an env var. The email's
only consumer is the reminder, which fires before expiry, and the owner
never sees the field at all — §[3.14](../spec/owner-dashboard.md)'s reconciliation and thank-you views
show name, item, amount, method, state, source and date, never an
address. So after expiry the value has no use and no operator judgement
attaches to how long it lingers. This follows ADR-[063](./0063-currency-validation-minor-unit-storage-and-the-ceiling.md)'s treatment of
`MAX_CONTRIBUTION_MINOR`: a setting with no decision behind it is a
constant, not configuration. A single predicate — `expiresAt + 7 days` —
covers expired, released and purchased holds alike, since all three
carry an `expiresAt` that ages out on the same clock.
