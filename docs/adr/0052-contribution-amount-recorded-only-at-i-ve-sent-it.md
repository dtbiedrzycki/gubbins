# 0052. Contribution amount recorded only at "I've sent it"

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Contribution amount is entered/recorded only at "I've sent it," after funds are sent — no pre-payment draft state exists server-side. A dedicated cross-device *pledge-recovery* secret is therefore unnecessary *(a separate, narrower guest-data-access secret is added later for GDPR self-service, not pledge recovery — see ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md))*; a same-session "already sent" hint (reusing the `sessionHash` pattern) covers accidental resubmission on the same device only

## Detail

**ADR-052 detail:** A dedicated `contributionSecret` (mirroring `holdSecret`)
was initially proposed for cross-device pledge recovery, but rejected once the
contribute flow was restructured so amount entry happens only after funds are
actually sent. Under that model no `Contribution` row exists until a single
atomic "I've sent it" submission — there is no intermediate server-side state
to strand across a tab close or device switch, which was the entire
justification for a recovery secret. The residual gap (no cross-device
pledge-status check; possible accidental resubmission if a guest forgets they
already pledged) is accepted for now. A same-session hint, reusing the
existing `sessionHash` pattern from holds (§[3.3](../../gubbins-spec.md#33-holds-single-items)), covers the common
accidental-resubmit case without new infrastructure. Revisit if this proves an
actual support burden post-launch.
