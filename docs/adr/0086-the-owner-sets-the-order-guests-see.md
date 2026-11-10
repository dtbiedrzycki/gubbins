# 0086. The owner sets the order guests see, and new gifts go first

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** dtbiedrzycki

## Context

A list showed its gifts in the order they were added, oldest first, and
the owner had no way to change it. Owners want the gifts they most want at
the top and similar gifts next to each other. Lists hold about 5 to 40
gifts. The design is in the
[reorder spec](../superpowers/specs/2026-11-10-reorder-items-design.md).

## Decision

- The owner can move a gift up one place, down one place, to the top or to
  the bottom. Guests see exactly that order.
- A new gift goes to the top of the list, next to the form that adds it.
- The order of the `Wishlist` aggregate's items is the only truth. Storage
  keeps each gift's index in that order as `items.position`, and loads gifts
  sorted by it.
- A move is an owner edit, like editing a gift. It is not a ledger event
  and leaves no record.
- Moving a gift past either end changes nothing and is not an error.

## Consequences

- Lists that existed before this change keep their oldest-first order.
  Migration `0002` fills in `position` from that order.
- Moving a gift to the top rewrites the position of every gift above it.
  At 40 gifts that cost doesn't matter.
- There is no unique index on `(wishlist_id, position)`. SQLite checks
  UNIQUE row by row, so it would trip partway through a save that shifts
  positions. Indices are unique by construction.
- Two owner devices moving gifts at once: the last write wins.
