# 0084. A hold covers one or more units; buying fewer releases the rest

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** dtbiedrzycki

## Context

A single gift can have a quantity above 1, such as 5 baby onesies. Each hold
reserved exactly one unit, so a guest buying 2 had to hold the gift twice and
manage two holds. The design is in the
[multi-unit hold spec](../superpowers/specs/2026-11-05-multi-unit-hold-design.md).

## Decision

A guest picks how many units to hold, and one hold covers them all. The count
is fixed when the hold is placed. Marking the hold purchased records how many
units were bought, from 1 up to the count held. The units not bought go back
to other guests at once. Extend and release always act on the whole hold.

The count of units bought is all that is stored. Every other count (units
held, bought and free) is still derived from the holds.

## Alternatives considered

- **One hold per unit, placed together** — rejected: the guest would manage
  several cards for one decision. The rules here would hold either way.
- **Releasing part of a hold** — rejected for now: release lets go of the
  whole hold, and buying fewer is the one way to give units back early.
- **Adding units to an existing hold** — rejected: a guest who wants more
  holds the gift again and gets a second hold.

## Consequences

- `ItemHeld` and `ItemPurchased` carry `units`, and the `holds` projection
  stores `units` and `purchased_units`.
- When ADR-[046](./0046-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)'s
  per-session cap is built, it counts holds, not units.
- ADR-[019](./0019-quantity-may-drop-below-committed-holds-purchases.md)'s
  committed count is counted in units.
