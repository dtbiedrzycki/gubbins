# 0011. Overfunding stays assigned to the same item

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

`group` and `fund` items have a target amount rather than a fixed price,
and accept contributions from many guests that accumulate toward it.
Contributions go to the owner, who buys the item — there is no
peer-to-peer money movement between guests
([group gifts & funds](../spec/group-gifts-and-funds.md)). Once
contributions exceed the target, or a contribution is confirmed after
the target is already met, a decision was needed for where that excess
is considered to belong.

## Decision

We will keep any amount beyond the target assigned to the same item
rather than moving it elsewhere. Whether overfunding is permitted at all
is governed separately by the list's `allowOverfunding` policy
(`block` | `warn` | `allow`); once contributed, the excess is rendered
as a percentage of target (e.g. "$520 of $450 · 116%")
([group gifts & funds](../spec/group-gifts-and-funds.md)).

## Alternatives considered

- **Redirecting or pooling excess contributions elsewhere on the list
  (e.g., toward other underfunded items)** — rejected: a contribution is
  tied to the item the guest chose to fund, and the system has no
  peer-to-peer or cross-item money movement; reassigning a guest's
  contribution to a different item after the fact would need a
  reallocation mechanism the model doesn't otherwise have, for a
  reversible, owner-visible edge case that `allowOverfunding` already
  lets an owner prevent up front if they don't want it.

## Consequences

- The item's funded percentage can exceed 100%, and the UI must render
  that plainly rather than clamping the display at the target.
- Underfunding and overfunding are handled by the same "leave it
  assigned, tell the truth about the total" principle: the owner UI
  states the actual total without implying refunds or reallocation in
  either direction.
- Because the ceiling that bounds a single contribution's amount is
  separate, currency-neutral input validation
  ([group gifts & funds](../spec/group-gifts-and-funds.md)) rather than
  overfunding policy, `allowOverfunding: allow` never bypasses it —
  overfunding and oversized-single-contribution are independent
  concerns that happen to interact on the same item.
