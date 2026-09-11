# 0020. Owner status/identity visibility auto-reveals at revealAfter

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Owner status/identity visibility auto-reveals at `revealAfter`, overriding `ownerSeesClaimStatus`/`ownerSeesClaimerIdentity` (reveal condition amended by ADR-[072](./0072-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md) to be sticky once crossed)

## Detail

**ADR-020 detail:** Without an override, spoiler settings would make an item permanently undeletable-with-a-clear-reason and reconciliation permanently ambiguous even after the event has passed and the owner needs to write thank-you notes. Auto-revealing at `revealAfter` (which already defaults to `eventDate`) resolves this without adding a new setting. Confirmed with the spec owner as an explicit assumption before locking in. Amended by ADR-[072](./0072-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md): `revealAfter` is derived from `eventDate` plus the list timezone rather than stored as a fixed instant, so the reveal condition is `revealedAt IS NOT NULL OR now >= revealAfter` rather than the time comparison alone. The decision itself is unchanged — reveal still auto-overrides `ownerSeesClaimStatus`/`ownerSeesClaimerIdentity` — but the check now consults the sticky flag first so a post-event edit to the timezone or event date cannot walk the reveal backwards.
