# 0058. Guest self-service data access/erasure via GuestDataAccess secret

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Guests need a way to exercise a subject-access/erasure right over
`GuestPii` data that already exists, once a hold or contribution is
confirmed. This is distinct from
ADR-[050](./0050-contribution-amount-recorded-only-at-i-ve-sent-it.md)'s
rejected `contributionSecret`: that secret would have let a guest resume
an in-progress *pledge* across devices, a convenience with nothing left
to recover once amount entry moved to happen only at "I've sent it." This
decision grants access to a different thing, for a different reason — a
subject-access/erasure right, not a recovery convenience — so revisiting
the surface doesn't undermine ADR-050's reasoning.

## Decision

We will provide guest self-service data access/erasure via a per-session
`GuestDataAccess` secret (durable link + live-session route), covering
all of a guest's holds and contributions on a list at once, reusing
ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s
redaction mechanism but invoked by the guest rather than the owner.

## Alternatives considered

- **Per-record secrets** (one per hold, one per contribution) — rejected
  in favor of one secret per guest session per list: a real
  subject-access request is naturally holistic ("what do you have on
  me," "delete my personal information across all of it"), not scoped to
  a single item, and a guest who held three items and pledged to two
  funds shouldn't need to track five separate links to exercise one
  right.
- **Session-scoped `GuestPii` storage**, matching this secret's
  granularity — considered and rejected as a deliberate inversion, not an
  inconsistency: this ADR's secret is session-scoped because a
  subject-access request is holistic, but that reasoning is about the
  *secret* and does not transfer one layer down to *storage*.
  Session-scoping `GuestPii` itself would break per-record messages,
  shared-device name handling, and the per-row redaction the owner side
  depends on — the reasons
  ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)
  keeps storage per-record. The two should be read together: storage is
  granular, access is holistic.

## Consequences

- The row is created lazily on first hold/contribution, not at session
  start, so a guest who only browses never accumulates a secret with
  nothing behind it.
- Rate limiting and constant-time comparison follow the same blanket
  rules already governing every other bearer secret in the system
  (ADR-[035](./0035-constant-time-comparison-generalized-to-all-secret.md),
  ADR-[040](./0040-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md))
  — no new security model, just an additional instance of the existing
  one.
- A limitation surfaced later, when key rotation was given a mechanism
  ([access & identity](../spec/access-identity.md), `keyGen`): rotation
  forces a new session and therefore a new `sessionHash`, so a guest who
  acts both before and after one holds two access links rather than one
  — reintroducing, at two, the fragmentation this ADR rejected per-record
  secrets to avoid. This is accepted rather than solved because it cannot
  be solved within the project's constraints: after rotation the system
  has no way to tell that two `sessionHash` values belong to the same
  person, that hash being the only identity in the system, and
  establishing otherwise would require a durable guest identity the
  no-accounts principle forbids. Neither link is *revoked*, though — each
  resolves by secret to its own row and continues to serve the records it
  covers, so an owner rotating a key never severs a guest from their
  erasure right, only from a single consolidated view of it.
