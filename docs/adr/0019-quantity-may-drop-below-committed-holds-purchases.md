# 0019. Quantity may drop below committed holds/purchases

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Single items enforce `activeHolds + purchased ≤ quantity` ([domain
model](../spec/domain-model.md)). An owner can reduce an item's `quantity`
at any time, including below the count of holds/purchases already
committed against it ([owner dashboard & editing rules](../spec/owner-dashboard.md)).

## Decision

We will allow `quantity` to drop below the currently committed count.
Existing holds/purchases are grandfathered in place; new holds are
blocked until releases or expiries bring the committed count back under
the new quantity. A reduction below the committed count shows the owner
a warning before saving that more may already be held or bought than
the new quantity; while claim status is hidden, it carries no counts.

## Alternatives considered

- **Block the quantity reduction below the committed count** — rejected
  as inconsistent with the overfunding-allowed philosophy elsewhere in
  the spec: the system already tolerates "more claimed than perfectly
  planned" for money, so doing the same for item counts avoids
  penalizing guests who already committed in good faith.
- **Reduce silently** — rejected: the owner may believe they have capped
  what they will receive when grandfathered commitments mean more may
  still arrive.
- **Warn with exact counts regardless of spoiler settings** — rejected:
  that more is committed than the new quantity is all the owner needs to
  know; the counts would spoil more than that.

## Consequences

- A quantity edit never invalidates an existing hold or purchase — the
  invariant is enforced going forward (new holds), not retroactively.
- The owner dashboard must be able to show an item that is
  over-committed relative to its current quantity without treating that
  as an error state.
- The warning is a deliberate, bounded spoiler: an owner with claim
  status hidden learns that commitments exceed the new quantity, but
  only when that is true and only when they reduce it.
