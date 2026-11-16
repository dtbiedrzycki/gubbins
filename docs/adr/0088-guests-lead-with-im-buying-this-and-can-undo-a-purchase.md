# 0088. Guests lead with "I'm buying this", and can undo a purchase

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** dtbiedrzycki

## Context

A guest who plans to buy a gift in a shop holds it, buys it, and often forgets
to come back and mark it purchased. The hold lapses
(ADR-[0002](./0002-holds-are-3-day-extendable-once-operator-configurable.md)),
the gift shows as available again, and another guest can buy a duplicate. An
early guest said they expect to forget in exactly this way. The design is in
the [buying-now spec](../superpowers/specs/2026-11-16-buying-now-design.md).

When a guest goes quiet, the app must assume either that they didn't buy
(a hold) or that they did. The guest knows which is more likely.

## Decision

Each available single gift leads with "I'm buying this". One confirmation
places a hold and marks all its units purchased at the same instant, in one
transaction, recording the same `ItemHeld` and `ItemPurchased` events as a
hold followed by a purchase. "Hold this item" stays, as the second option for
guests who aren't sure.

A guest can undo any purchase of theirs. `PurchaseVoided` records it, every
unit bought goes back to other guests, and the undone purchase counts for
nothing. The undo ships after "I'm buying this".

The owner accepts the cost: a guest who commits, doesn't buy and doesn't come
back leaves a gift marked bought that never arrives.

## Alternatives considered

- **Longer holds** — rejected: they still lapse, and every abandoned hold
  keeps a gift locked for longer. `HOLD_DURATION_DAYS` remains the lever if
  guests report running out of time.
- **Email reminders** — rejected: storing addresses and running a sender
  goes against the minimal-data stance of
  ADR-[0001](./0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md).
- **Browser notifications** — rejected: they need a service worker, stored
  push subscriptions and a scheduled sender, and iPhones show them only for
  home-screen installs.
- **A calendar reminder the guest saves** — not chosen: the guest still has
  to come back.
- **"I'm buying this" with no undo** — rejected: once it is the default, the
  guest whose plans change needs a way to free the gift.
- **Holding as the default, "I'm buying this" second** — rejected by the
  owner in favour of leading with the common, confident case.

## Consequences

- No new event type or migration for "I'm buying this". The undo adds
  `PurchaseVoided` by a guest (amending
  ADR-[0075](./0075-ledger-events-record-the-acting-role.md)'s owner-only
  note), a hold status for an undone purchase, and a migration adding
  `holds.voided_at`.
- Until the undo ships, a guest's "I'm buying this" can't be taken back, and
  the sheet says so.
