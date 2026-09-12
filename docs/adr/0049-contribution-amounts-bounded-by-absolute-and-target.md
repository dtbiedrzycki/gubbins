# 0049. Contribution amounts bounded by absolute and target-relative ceilings

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The spec bounded contribution amounts only by the overfunding policy,
which under `allow` is no bound at all. A single mistyped or hostile
amount would not overflow a SQLite integer but would destroy the progress
bar's usefulness and the reconciliation totals. The ceiling needs to sit
outside the overfunding policy rather than inside it: overfunding is a
product decision about whether guests may exceed a target, and the
project's stated stance there is permissive; a sanity ceiling is input
validation against a nonsense value, and the two should not be conflated
such that a permissive product choice disables a sanity check.

*Note: the absolute figure below was later revised by a subsequent
decision; the target-relative bound and independence from overfunding
policy were not.*

## Decision

We will bound contribution amounts by both an absolute and a
target-relative sanity ceiling, enforced in `canAccept` independently of
`allowOverfunding`. Manual entries warn rather than block, since the owner
is the authoritative party recording a real-world fact.

## Alternatives considered

- **Fold the sanity ceiling into the overfunding policy** — rejected: a
  permissive overfunding stance is a product decision about whether guests
  may exceed a target, not a decision to disable input validation against
  a nonsense value; conflating the two would let a permissive policy
  choice silently remove the sanity check.
- **Block manual entries that exceed the ceiling** — rejected: the owner
  is the authoritative party recording a real-world fact, so manual
  entries warn rather than block.

## Consequences

- Contribution amounts are protected from mistyped or hostile nonsense
  values regardless of the list's overfunding policy.
- The absolute figure (`MAX_CONTRIBUTION_MINOR`) was later found to
  denominate differently across currencies — the same minor-unit constant
  is a small amount on a JPY list and a much larger one on a
  low-decimal-precision currency like KWD — and a subsequent decision
  revised how the absolute bound is derived, without a per-currency
  default table. That revision only touches the absolute figure: the
  target-relative bound, its independence from `allowOverfunding`, and the
  reasoning above that a permissive overfunding stance must not disable a
  sanity check are unaffected and still govern this decision.
