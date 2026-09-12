# 0023. Giver message visible to owner immediately, not spoiler-gated

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

A Hold or Contribution can carry an optional giver→owner message ("so
excited for you two!") alongside the same escaping treatment given to
names elsewhere ([owner dashboard & editing rules](../spec/owner-dashboard.md)). The spoiler mechanism
(`ownerSeesClaimStatus`/`ownerSeesClaimerIdentity`/`revealAfter`,
ADR-[020](./0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md)) exists to preserve the surprise of *what was claimed and by
whom*, and it isn't obvious on its face whether a free-text message
attached to a claim should be covered by that same gate.

## Decision

We will make an optional giver→owner message on a Hold/Contribution
visible to the owner immediately, not gated by the spoiler toggles or by
`revealAfter`.

## Alternatives considered

- **Gate the message behind the same spoiler mechanism as claim status**
  — rejected: the message is sentiment, not claim-status information.
  Withholding a heartfelt note until after the event serves no one, and
  the spoiler mechanism was never meant to suppress well-wishes, only
  the surprise of the claim itself.

## Consequences

- The owner can read and respond to giver messages in real time,
  independent of whether the list has revealed claim status yet.
- This was confirmed with the spec owner as an explicit assumption
  before locking it in.
- Any future message-adjacent feature needs to be checked against this
  distinction: content that is sentiment stays ungated; content that
  reveals claim status stays behind ADR-[020](./0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md)'s mechanism.
