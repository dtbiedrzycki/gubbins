# 0078. Wishlist is the aggregate root for its items and holds

- **Status:** Accepted
- **Date:** 2026-09-13
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
  `Wishlist.getItem` is the authorization step. Repositories load and
  store the whole aggregate. There is no use-case-facing item
  repository.
- `Hold` is its own aggregate, referenced by `itemId`; `Contribution`
  will be too. The wishlist authorizes and decides commands on holds
  (`holdItem`, `extendHold`, `releaseHold`, `purchaseHold`), and the
  use case persists the results in the same unit of work. A purchase
  is a terminal state of a `Hold`, not a separate aggregate.
- The aggregate carries a snapshot of the list's active holds, loaded
  with it, so list-wide rules (availability from hold state, the
  session cap) are decided in the domain rather than in a use case or
  a query.
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

## Consequences

- Loading the aggregate loads its active holds. The load stays bounded
  because only active holds are loaded, never expired or closed ones,
  and a port contract suite pins that boundary (holds-lifecycle D8).
- Cross-item rules are read inside the same transaction as the append,
  serialized by `BEGIN IMMEDIATE`
  ([backend architecture](../spec/backend-architecture.md)).
- The write path persists only what the domain decided
  (`saveItemState`) and never recomputes it.
- A list with very many active holds makes each command's load larger.
  That is acceptable at the scale the
  [performance & resource budget](../spec/performance-and-resource-budget.md)
  assumes; revisit if measurement says otherwise.
