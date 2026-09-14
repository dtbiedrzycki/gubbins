# 0075. Ledger events record the acting role

- **Status:** Proposed
- **Date:** 2026-09-14
- **Deciders:** dtbiedrzycki

## Context

Applying ADR-[007](./0007-event-sourcing-for-the-ledger-only-audit-table-for-crud.md)'s
event tests to the existing event types surfaced a gap. Two events are raised
by either role:

- **`HoldReleased`** — by the guest from the private hold link
  ([holds](../spec/holds.md)), or by the owner from the dashboard
  (ADR-[046](./0046-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)).
- **`ItemPurchased`** — by the guest from the hold confirmation screen
  ([guest UX](../spec/guest-ux.md)), or by the owner as a direct offline
  purchase, including the combined action with `ManualGiftEntry`
  (ADR-[059](./0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)).

Nothing in either payload records which. Owner-side release exists
specifically as the recovery path against hold-hoarding, so "who released
this hold" is the first question a dispute between a guest and the owner
would ask. Both events already pass ADR-007's tests, and its second
test is precisely about distinctions a domain expert would draw: an
owner releasing a guest's hold is a different story from the guest
releasing it. As recorded, the append-only log is silently ambiguous
about that difference. This is not a new event, so ADR-007's first test
does not apply to it: it is attribution on events that already qualify.

The remaining types are single-role today: `ItemHeld`, `HoldExtended`,
and `ContributionPledged` are guest-only; `PurchaseVoided`,
`ContributionConfirmed`, `ContributionVoided`, and
`ManualContributionRecorded` are owner-only
([holds](../spec/holds.md),
ADR-[004](./0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md),
[manual contributions](../spec/manual-contributions.md)).

Attribution cannot be backfilled. Once shared-role events are written
without it, that history is permanently ambiguous. The project is
pre-1.0 with no deployed instances, so the event log's shape can still
be amended in place, consistent with the precedent in
ADR-[048](./0048-hold-contribution-submits-carry-a-client-generated.md)
and ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md).

## Decision

We will record the acting role on every ledger event as envelope
metadata: an `actor` column on the event log row, alongside `event_type`
and `seq`, not a field inside the payload. It is `NOT NULL` with a check
constraint limiting it to `guest` or `owner`.

The value is derived server-side from the credential that authorised the
command: the owner access cookie yields `owner`; a guest session or hold
secret yields `guest`. It is never taken from request input. The
`EventStore.append` port
([backend architecture](../spec/backend-architecture.md)) takes it as an
argument supplied by the use case.

`actor` is a role, not an identity. It carries no session hash, token,
or name.

## Alternatives considered

- **A payload field on `HoldReleased` and `ItemPurchased` only** —
  rejected: it records attribution in two places a writer must remember,
  and the next type to become shared (an owner-side hold extension, a
  guest-withdrawn pledge) would need a payload version bump and an
  upcaster under
  ADR-[032](./0032-migrations-are-forward-only-rollback-restore-from-backup.md).
  Envelope metadata sits outside payload versioning entirely.
- **Infer the role from other data**, such as `ItemPurchased` with a
  hold versus without — rejected: `HoldReleased` has no distinguishing
  data at all, and inference couples attribution to incidental payload
  shape that later changes can silently break.
- **Separate event types** (`OwnerReleasedHold`,
  `OwnerMarkedPurchased`) — rejected: the fold is identical for both
  roles, which is the same reasoning ADR-[060](./0060-manual-contributions-are-voidable-not-editable.md)
  used to reject a separate `ManualContributionVoided`. Splitting would
  double types and upcaster surface to encode one attribute.
- **Record identity rather than role** — rejected: owner tokens are
  shared per list
  (ADR-[015](./0015-owner-tokens-are-shared-per-list-not-per-owner.md)),
  so no per-owner identity exists to record. Adding a guest session hash
  to every row would put a credential-derived value on events where no
  fold or policy reads it. `ItemHeld` already carries `sessionHash`
  where the concurrent-hold cap reads it.
- **Defer until a screen displays it** — rejected: unlike the
  deferred item-field history in ADR-007, the owner release control is
  live from the first deployment, and attribution for events written
  before the change cannot be recovered.

## Consequences

- Every append supplies a role, so no write path can omit it, and the
  database constraint backstops the application.
- For single-role types the column is redundant with the type today.
  That cost is accepted so that a type becoming shared requires no
  schema or upcaster change. A test should assert each type is appended
  only with its currently permitted roles, so a new shared path is a
  deliberate change rather than an accident.
- No projection changes and no fold changes. `rebuildProjections` is
  unaffected. Displaying attribution on the dashboard, for example
  "released by the owner," is a separate spec change that this decision
  makes possible without requiring.
- No PII enters the log. The `piiRef` structural test
  ([testing](../spec/testing.md)) is unaffected, since `actor` is a
  fixed two-value role.
- There is no `system` role. No event is system-emitted: hold expiry is
  derived, and the one periodic task
  (ADR-[063](./0063-one-periodic-task-with-giver-email-purge-attached.md))
  emits no events. Adding a system-emitted event requires an ADR and a
  forward migration extending the constraint.
- **Follow-up work on acceptance:**
  [data & persistence](../spec/data-and-persistence.md) gains a bullet
  for the envelope column; [backend architecture](../spec/backend-architecture.md)
  updates the `EventStore.append` signature; and the walking-skeleton
  schema migration, which creates the event log without this column, is
  amended in place per the pre-1.0 precedent above.
