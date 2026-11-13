# 0087. The owner picks the list's style from a fixed set

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** dtbiedrzycki

## Context

Every list looked the same: the Storybook look. The owner wanted a second
look, Groovy, that a list owner can choose for their list, so guests see it
too. The design is in the
[list style spec](../superpowers/specs/2026-11-13-list-style-design.md).

## Decision

- A list has a style, one of a fixed set: `storybook` (the default) or
  `groovy`. The `Wishlist` aggregate owns the set; storage keeps the value
  as `wishlists.theme` with no CHECK (ADR-0083).
- The owner changes it when editing the list's details. A new list starts as
  Storybook. Changing it is an owner edit, not a ledger event.
- A style is a set of values for the existing theme tokens and the display
  font. Components never branch on the style.
- The list page and the manage page show the list's style. The guest key
  screen can't, because it shows before the list is known.

## Alternatives considered

- **A per-device toggle in local storage.** No storage change, but guests
  would never see what the owner chose.
- **Custom colours chosen by the owner.** More freedom, but every
  combination would need its own contrast check.
- **Choosing the style on the create form too.** Left out; owners can
  change it straight after creating the list.

## Consequences

- A new style is a new token block in `index.css` and a new value in the
  set. It needs no migration.
- Decorations with hard-coded colours (the seals' highlights, the door)
  keep their Storybook colours in every style.
