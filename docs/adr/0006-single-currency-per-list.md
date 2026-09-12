# 0006. Single currency per list

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Money amounts appear throughout a list — item prices, contribution
targets, pledge amounts — and need a currency to be meaningful.
Supporting multiple currencies within one list would require conversion
rates, rounding rules, and a decision about which currency to display
totals in, none of which have a stable, correct answer for a lightweight,
self-hosted gift-list tool.

## Decision

We will scope currency to the list as a whole: every list has exactly
one ISO 4217 currency code, validated at write time, and all items,
prices, and contributions within that list are denominated in it. There
is no per-item or per-contribution currency override, and no currency
conversion.

## Alternatives considered

- **Per-item currency** — rejected: would require currency conversion to
  render any list-level total or progress bar, introducing exchange-rate
  sourcing, staleness, and rounding problems the project has no need to
  take on.
- **Currency conversion between a contribution's currency and the list's
  currency** — rejected: the same rate-sourcing and correctness problems
  as per-item currency, for a feature with no evidenced demand.

## Consequences

- Every amount in a list can be summed, compared, and rendered without
  conversion logic.
- ADR-[063](./0063-currency-validation-minor-unit-storage-and-the-ceiling.md)'s
  rounding and minor-unit-storage policy can assume a single currency per
  list rather than handling mixed-currency arithmetic.
- An owner running an event with contributors in multiple currencies must
  pick one currency for the list; the app offers no accommodation beyond
  that.
