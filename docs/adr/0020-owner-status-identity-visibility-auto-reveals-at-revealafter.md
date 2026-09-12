# 0020. Owner status/identity visibility auto-reveals at revealAfter

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Owners can turn on spoiler settings (`ownerSeesClaimStatus`,
`ownerSeesClaimerIdentity`) so they don't see who claimed what before the
event ([owner dashboard & editing rules](../spec/owner-dashboard.md)). Left
unconditional, those settings would stay in permanent control: an item
would be permanently undeletable with a clear reason, and reconciliation
would stay permanently ambiguous even after the event has passed and the
owner needs to write thank-you notes. `revealAfter` already exists on
every list as a stored instant, defaulting at creation to the end of
`eventDate` in the list's timezone ([time, timezones & display](../spec/time-and-timezones.md), ADR-[066](./0066-revealafter-is-stored-not-derived.md)) —
a natural point past which spoiler secrecy no longer serves a purpose.

## Decision

We will auto-reveal owner-facing claim status and claimer identity once
the list crosses `revealAfter`, overriding `ownerSeesClaimStatus` and
`ownerSeesClaimerIdentity` regardless of how the owner has them
configured.

## Alternatives considered

- **Leave the spoiler toggles in permanent control, with no auto-reveal**
  — rejected: would leave an item permanently undeletable with a clear
  reason and reconciliation permanently ambiguous, blocking the owner
  from ever confidently writing thank-you notes after the event.
- **Add a new dedicated reveal-override setting** — rejected: `revealAfter`
  already exists as a natural reveal boundary tied to the event ending;
  reusing it resolves the ambiguity without adding a redundant
  owner-facing setting.

## Consequences

- The reveal condition is `revealedAt IS NOT NULL OR now >= revealAfter`
  ([owner dashboard & editing rules](../spec/owner-dashboard.md)). ADR-[072](./0072-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md) later added `revealedAt` as a
  one-way sticky flag set on first crossing, so a subsequent edit can't
  walk the reveal backwards once the owner has already seen it — the
  decision here is unchanged by that amendment, `Status` stays `Accepted`.
- `revealAfter` itself is a stored instant, not derived from `eventDate`
  at read time (ADR-[066](./0066-revealafter-is-stored-not-derived.md)): it is set once at creation and does not move
  when `eventDate` or `timezone` are edited afterward.
- This auto-reveal behavior was confirmed with the spec owner as an
  explicit assumption before being locked in.
