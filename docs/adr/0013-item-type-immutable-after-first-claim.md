# 0013. Item type immutable after first claim

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

An item's `type` (`single` | `group` | `fund`) determines fundamentally
different claim mechanics: a `single` item is held and then purchased in
whole units, while `group`/`fund` items accept many partial
contributions toward a target and have no holds at all
([domain model](../spec/domain-model.md),
[group gifts & funds](../spec/group-gifts-and-funds.md)). Owners can
edit most item fields freely, so a decision was needed on whether
`type` could still be changed after a guest has already acted on the
item under its current rules.

## Decision

We will make `type` immutable once any hold or contribution exists on
the item; it may still be freely edited before the item has been
claimed in any way ([domain model](../spec/domain-model.md)).

## Alternatives considered

- **Allowing `type` to be changed at any time, including after guests
  have already placed holds or made contributions** — rejected: existing
  holds and contributions were made under one type's rules (a hold
  reserves a unit of a `single` item; a contribution funds a
  `group`/`fund` item's target), and changing the type afterward would
  reinterpret that already-recorded state under a different set of
  rules it was never created under — silent corruption of what the
  stored state means, not a simple field edit.

## Consequences

- Owner-side item editing must check for existing holds or contributions
  before allowing a type change, and remove that control once any exist.
- An owner who genuinely needs to switch an item's type after it has
  been claimed must archive it and create a new one, rather than
  converting it in place — consistent with items with ledger history
  being archived rather than deleted
  (ADR-[017](./0017-items-with-ledger-history-are-archived-not-deleted.md)).
- This sets the precedent ADR-[063](./0063-currency-validation-minor-unit-storage-and-the-ceiling.md)
  cites directly for making a list's `currency` immutable once a priced
  item exists: reinterpreting already-stored state in place under new
  rules is treated as silent corruption in both cases.
