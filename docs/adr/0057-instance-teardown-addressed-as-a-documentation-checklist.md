# 0057. Instance teardown addressed as a documentation checklist

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Instance teardown addressed as a documentation checklist (deployment guide) rather than an active app-level signal; no cross-list expiry-monitoring built

## Detail

**ADR-057 detail:** An active app-level signal — a flag or health-endpoint
field that fires once every list on the instance has passed `purgeAt` —
was considered as a "safe to stop now" indicator for the operator.
Rejected: it requires scanning across all lists on the instance, which is
extra machinery for a case the deployment shape mostly avoids already
(ADR-[014](./0014-list-creation-self-locks-gated-by-createsecret-thereafter.md)'s self-lock and ADR-[053](./0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)'s recovery reasoning both lean on the
dominant shape being one list per instance, one operator who is also the
owner). It would also be one more thing exposed via `/health` or
`/metrics` whose meaning ("nothing left on this box") is itself mildly
informative to anyone who can reach those endpoints, for a benefit that a
docs checklist delivers just as well to the audience that actually reads
setup docs before going live. Consistent with the project's general
preference (ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md), ADR-[034](./0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md), ADR-[053](./0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)) for documentation or a deferred
flag over new runtime mechanism when the underlying need is operator
process, not application behavior.
