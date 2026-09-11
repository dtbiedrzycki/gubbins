# 0060. Guest self-service data access/erasure via GuestDataAccess secret

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Guest self-service data access/erasure via a per-session `GuestDataAccess` secret (durable link + live-session route), covering all of a guest's holds and contributions on a list at once; reuses ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s redaction mechanism, invoked by the guest rather than the owner

## Detail

**ADR-060 detail:** ADR-[052](./0052-contribution-amount-recorded-only-at-i-ve-sent-it.md) rejected a `contributionSecret` for
cross-device *pledge recovery*, reasoning that no intermediate server
state exists to protect once amount entry moved to happen only at "I've
sent it." This ADR is not a reversal of that: it grants access to a
different thing, for a different reason. ADR-[052](./0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)'s rejected secret would
have let a guest resume an in-progress pledge across devices — a
convenience feature with nothing left to recover once the flow was
restructured. This secret grants a guest access to `GuestPii` data that
already exists, once a hold or contribution is confirmed — a
subject-access/erasure right, not a recovery convenience, and one that
exists regardless of how the contribution flow is shaped. The two
questions only look similar because they're both "should a contribution
carry a guest-held secret" — the actual justification is unrelated, so
revisiting the surface doesn't undermine ADR-[052](./0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)'s reasoning.

Per-record secrets (one per hold, one per contribution) were considered
and rejected in favor of one secret per guest session per list: a real
subject-access request is naturally holistic ("what do you have on me,"
"delete my personal information across all of it"), not scoped to a
single item, and a guest who held three items and pledged to two funds
shouldn't need to track five separate links to exercise one right. The
row is created lazily on first hold/contribution, not at session start,
so a guest who only browses never accumulates a secret with nothing
behind it. Rate limiting and constant-time comparison follow the same
blanket rules already governing every other bearer secret in the system
(ADR-[036](./0036-constant-time-comparison-generalized-to-all-secret.md), ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)) — no new security model, just an additional instance
of the existing one.

One limitation surfaced later, when key rotation was given a mechanism
(§[3.1](../spec/access-identity.md), `keyGen`). Rotation forces a new session and therefore a new
`sessionHash`, so a guest who acts both before and after one holds two
access links rather than one — reintroducing, at two, the fragmentation
this ADR rejected per-record secrets to avoid. It is accepted rather
than solved because it cannot be solved within the project's
constraints: after rotation the system has no way to tell that two
`sessionHash` values belong to the same person, that hash being the only
identity in the system, and establishing otherwise would require a
durable guest identity the no-accounts principle forbids. What the
design does guarantee is that neither link is *revoked* — each resolves
by secret to its own row and continues to serve the records it covers,
so an owner rotating a key never severs a guest from their erasure
right, only from a single consolidated view of it.

Note the granularity inversion against ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md), which is intentional:
the *secret* is session-scoped because a subject-access request is
holistic, while `GuestPii` *storage* stays per-record for the reasons
set out there. The reasoning above is about secrets and does not
transfer one layer down — session-scoping the PII table itself would
break per-record messages, shared-device name handling, and the
per-row redaction the owner side depends on.
