# 0078. Wishlist is the aggregate root for its items, holds and contributions

- **Status:** Accepted
- **Date:** 2026-09-13
- **Amended:** 2026-10-15. Holds and contributions moved inside the aggregate, and the whole list is now loaded.
- **Amended:** 2026-10-16. An item decides extending, releasing and purchasing its holds; the wishlist resolves the item and delegates, and the item refuses a hold it did not load.
- **Deciders:** dtbiedrzycki

## Context

The walking skeleton let use cases load an `Item` through an
`ItemRepository` of their own. Two independent design reviews of the
skeleton (2026-09-13) found two problems with that. The rule deciding
whether a caller may act on an item at all, "is it on the list you
are keyed into?", had no single owner. And the write path had started
deciding availability itself (`markHeld` recomputing `active_holds`).
The code was retrofitted so that `Wishlist` owns its items, but no
ADR recorded the decision (roadmap open item 1).

Sub-project 2 makes the answer load-bearing. The hold lifecycle needs
availability decided from hold state, and the concurrent-hold cap
(ADR-[046](./0046-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md))
is the first rule that spans items. ADR-[008](./0008-event-streams-scoped-per-item-not-per-list.md)
scopes event streams per item, which can read as an argument for
`Item` as the root. It is not: that ADR is about storage partitioning
and optimistic concurrency
(ADR-[010](./0010-seq-based-optimistic-concurrency-no-hash-chaining.md)),
not about who enforces invariants.

## Decision

We will treat `Wishlist` as the aggregate root.

- An `Item` is reachable only through the wishlist that owns it, and
  `Wishlist.getItem` is the authorization step.
- The boundary is `Wishlist → Item → Hold / Contribution`. `Hold` and
  `Contribution` are entities nested under their `Item`, not aggregates
  of their own. The wishlist authorizes (`getItem`, `findHold`) and owns
  rules that span items; an item decides on its own holds and
  contributions (availability, purchased count, placing, extending,
  releasing and purchasing a hold, pledging); a hold or contribution
  records its own lifecycle. The wishlist's command for each resolves
  the item and delegates to it. A purchase is a terminal state of a
  `Hold`.
- Repositories load and save the whole aggregate: the list, every item,
  and every hold and contribution on it. There are no use-case-facing
  item, hold or contribution repositories. A command's only other writes
  are the event append and records outside the aggregate.
- Event streams stay per item. The aggregate decides; each item's
  stream records the decision and is where seq-based concurrency
  applies.
- Plain-CRUD records (`GuestPii`, `GuestDataAccess`, `ThankYouStatus`,
  `ManualGiftEntry`) sit outside the aggregate and are referenced by id.

## Alternatives considered

- **`Item` as the aggregate root, matching the streams** — rejected:
  the cap spans items. Per-item roots could enforce it only through a
  domain service reading other roots, and "is this item on your list"
  would live outside the domain.
- **One aggregate per list with one list-wide stream** — rejected: it
  contradicts ADR-008, and unrelated holds on different items would
  conflict with each other.
- **No explicit root (a repository per entity, rules in use cases)** —
  rejected: this is the shape the skeleton reviews found rules leaking
  out of, including a write path that decided availability.
- **`Hold` (and `Contribution`) as aggregates of their own** — the
  original form of this ADR, rejected on 2026-10-15: the wishlist
  created and changed holds anyway, so each use case cascaded the
  writes by hand (event, hold, item state) and repeated that cascade.
  The quantity rule spans an item and all its holds, so they belong
  inside one boundary.

## Consequences

- Loading the aggregate loads every hold and contribution on the list,
  as it loads every item. Expired holds are never closed (lazy expiry),
  so the load grows with a list's history; at the scale the
  [performance & resource budget](../spec/performance-and-resource-budget.md)
  assumes this is small. Revisit if a list's history grows large.
- Cross-item rules are read inside the same transaction as the append,
  serialized by `BEGIN IMMEDIATE`
  ([backend architecture](../spec/backend-architecture.md)).
- The write path persists only what the domain decided
  (`WishlistRepository.save`) and never recomputes it.
