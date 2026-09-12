# 0041. Demo instance formally deferred, not rejected

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

A hosted demo instance was evaluated as a real adoption aid
(try-before-you-self-host), but running one is ongoing hosting and
maintenance infrastructure that sits in tension with the project's
"no infra run on your behalf" posture. Whether to run one is a
resourcing decision about the maintainer's time and risk tolerance, not
a spec-correctness question.

## Decision

We will formally defer a demo instance rather than reject it outright,
revisiting the decision post-1.0.

## Alternatives considered

- **Build a demo instance now** — rejected for now: adds ongoing
  hosting/maintenance infrastructure in tension with the project's
  "no infra run on your behalf" posture, ahead of 1.0.
- **Reject a demo instance outright** — rejected: a demo instance is a
  real adoption aid, and the objection is about resourcing timing, not
  about the idea being wrong: folding it into a permanent "no" would
  overstate the case against it.

## Consequences

- If pursued later, the requirements — nightly reset, seeded fake data,
  clear labeling, the same rate limits and `noindex` as production — are
  already specified in the
  [governance, licensing & release](../spec/governance-licensing-and-release.md)
  topic, so proceeding requires only a decision to spend the maintenance
  time, not new design work.
- No demo instance exists before 1.0; the decision to build one is
  explicitly revisited post-1.0 rather than left unaddressed.
