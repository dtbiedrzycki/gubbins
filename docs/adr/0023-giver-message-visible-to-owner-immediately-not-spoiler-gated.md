# 0023. Giver message visible to owner immediately, not spoiler-gated

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Optional giver→owner message on Hold/Contribution is visible to the owner immediately, not gated by spoiler toggles or `revealAfter`

## Detail

**ADR-023 detail:** A giver's note to the owner ("so excited for you two!") is sentiment, not claim-status information — the spoiler mechanism (`ownerSeesClaimStatus`/`ownerSeesClaimerIdentity`/`revealAfter`) exists to preserve the *surprise of what was claimed and by whom*, not to withhold well-wishes. Gating messages behind the same mechanism would mean an owner can't read a heartfelt note until after the event, which serves no one. Confirmed with the spec owner as an explicit assumption before locking in.
