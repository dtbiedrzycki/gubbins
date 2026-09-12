# 0052. Contribution amount recorded only at "I've sent it"

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

A dedicated `contributionSecret` (mirroring `holdSecret`) was initially
proposed for cross-device pledge recovery, but the contribute flow was
restructured so amount entry happens only after funds are actually sent.
Under that model no `Contribution` row exists until a single atomic "I've
sent it" submission — there is no intermediate server-side state to strand
across a tab close or device switch, which was the entire justification
for a recovery secret.

## Decision

We will record the contribution amount only at "I've sent it," after funds
are sent, with no pre-payment draft state server-side — so a dedicated
cross-device pledge-recovery secret is unnecessary. A same-session
"already sent" hint, reusing the `sessionHash` pattern from
[holds](../spec/holds.md), covers accidental resubmission on the same
device only.

## Alternatives considered

- **A dedicated `contributionSecret` for cross-device pledge recovery**
  (mirroring `holdSecret`) — rejected once amount entry was moved to only
  after funds are sent: with no intermediate server-side state to strand,
  there is nothing left for such a secret to recover.

## Consequences

- The residual gap — no cross-device pledge-status check, and possible
  accidental resubmission if a guest forgets they already pledged — is
  accepted for now. A same-session hint covers the common accidental-resubmit
  case without new infrastructure; revisit if this proves an actual support
  burden post-launch.
- This secret is distinct in purpose from the later guest-data-access
  secret added for GDPR self-service
  (ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)):
  this ADR is about recovery convenience for an in-flight pledge, while
  ADR-060's secret is about a guest's subject-access right over their own
  data. A reader should not conflate the two secrets — this decision
  concludes no recovery secret is needed here, and does not preempt or
  substitute for ADR-060's unrelated one.
