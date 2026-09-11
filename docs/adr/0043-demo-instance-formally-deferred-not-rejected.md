# 0043. Demo instance formally deferred, not rejected

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Demo instance formally deferred (not rejected); revisit post-1.0

## Detail

**ADR-043 detail:** A demo instance was evaluated as a real adoption aid (try-before-you-self-host) but recognized as ongoing hosting/maintenance infrastructure that sits in tension with the project's "no infra run on your behalf" posture — running one is a resourcing decision about the maintainer's time and risk tolerance, not a spec-correctness question, so it's recorded as explicitly deferred rather than folded into a default. If pursued later, the requirements (nightly reset, seeded fake data, clear labeling, same rate limits and `noindex` as production) are already specified in §[3.20](../spec/governance-licensing-and-release.md) so the decision to proceed doesn't require new design work, only a decision to spend the maintenance time.
