# Wishlist → Item → Hold / Contribution boundary

- **Date:** 2026-10-15
- **Status:** Implemented in #74–#82, then refined by review in #83–#86. This document describes the design as built.
- **Builds on:** `feat/launch/34-wishlist-save-holds` (`wishlists.save(wishlist)` already writes items and holds)

## Why

`HoldItem` and the other hold commands mix two ways of writing: the
`Wishlist` aggregate decides and creates or changes `Hold` instances, and
then the use case writes those holds through `ctx.holds` and the item
state through `ctx.wishlists`, in an order it has to know. ADR-0078 calls
`Hold` its own aggregate, but `Wishlist` creates and mutates it, so the
use cases cascade the writes by hand and repeat that cascade between
`HoldItem` and `runHoldCommand`.

The rule that matters, "active plus purchased holds on an item never
exceed its quantity", spans an item and all its holds. The aggregate
boundary should be drawn around that data.

## Goals

- The boundary is `Wishlist → Item → Hold / Contribution`. Holds and
  contributions are entities inside the `Wishlist` aggregate, nested
  under their `Item`.
- Use cases touch only `wishlists`, `eventStore` and `guestPii`, and
  make one `wishlists.save(wishlist)` per command.
- Every rule lives in the domain, including the idempotency-replay
  rule ("another session's key never hands over that session's hold").
- No behaviour change, except that a pledge taking an item's total past
  `MAX_MONEY_MINOR` is refused. Route and e2e tests pass unchanged.

## Non-goals

- No new migration or table change. #83 drops an unused index from the
  initial migration, which is edited in place until release.
- Commands keep returning their ledger events. Collecting events on
  entities stays rejected.
- Event streams stay per item (ADR-0008), with seq-based concurrency
  (ADR-0010).
- `GuestPii` and the other plain-CRUD records stay outside the
  aggregate (ADR-0057). The use case keeps minting `piiRef` beside the
  `guest_pii` insert.

## Domain model

```
Wishlist (root)   authorizes: getItem, findHold; rules that span items
 └─ Item          decides: placeHold, pledge, extend, release, purchase,
                  availability, purchased count
     ├─ holds          every hold on the item
     └─ contributions  every contribution on the item
        Hold / Contribution record their own lifecycle
```

- `Item` owns `holds` and `contributions` and derives its counts from
  them. `availableUnits()` loses its count arguments, and
  `statusGiven(...)` becomes `status()`.
- `Item` gets the aggregate's `asOf` when it is built or loaded, never
  per call, so commands and queries still take no date. `Hold.statusAt`
  is called with that instant.
- `Wishlist` keeps the command entry points (`holdItem`, `extendHold`,
  `releaseHold`, `purchaseHold`, `pledge`). Each resolves the item and
  delegates to it, and the item makes the decision, refusals included.
  The item's event-sequence bookkeeping (`recordEvent`) is private.
  `Wishlist._holds` and `Wishlist.owns` are removed, and `findHold(id)`
  searches the items, so a hold on another list is never found.
- New domain methods:
  - `findHoldForReplay(itemId, idempotencyKey, sessionHash)`: returns
    the original hold for the same session, throws
    `ItemUnavailableError` for another session's key, or returns null
    when there is none. It uses `Item.findHoldWithKey(idempotencyKey)`.
  - `findContributionForReplay(itemId, idempotencyKey, sessionHash)`
    works the same way, using `Item.findContributionWithKey`.
  - `holdsForSession(sessionHash)`: every hold that session placed on
    the list.
  - `Item.pledgedTotal()`: a `Money`, derived from its contributions.
    `Money` allows 0 (an item with no pledges), a pledge itself must
    still be more than 0, and `MAX_MONEY_MINOR` bounds the item's total
    as well as each pledge, so the total is always valid (ADR-0061,
    amended).

## Loading and saving

- `WishlistRepository.findById(id, now)` and `findBySlug(slug, now)`
  load the list, every item, and **every** hold and contribution on the
  list, the same way items are loaded today. There is no partial load
  and no load options. `ItemRepository` returns plain `ItemRow`s, and
  the wishlist repository's `hydrate` assembles each `Item` with its
  holds and contributions.
- `save(wishlist)` writes each item's `seq` as the domain left it,
  inserts new holds, saves the lifecycle of existing holds, and inserts
  new contributions (contributions are never updated). It recomputes
  nothing.
- `TransactionContext` becomes `{ wishlists, eventStore, guestPii }`.
- `HoldRepository` and `ContributionRepository` remain as interfaces
  used only by `WishlistRepositoryKysely` and the in-memory fake. They
  shrink to `findForWishlist`, `insert`, and `save` (holds only). Their
  contract suites stay and run against both adapters.
- Removed: `findById`, `findByIdempotencyKey`, `findForSession`,
  `findActiveOrPurchasedForWishlist`, `pledgedTotals`, and
  `findOwnedHold` in `holdCommand.ts`.

## Use-case flow

- `HoldItem`: load the wishlist, then `findHoldForReplay`. On a
  replay, return its view. Otherwise call `holdItem`, append the event,
  insert the guest PII, and `save`.
- `PledgeContribution`: the same shape with `findContributionForReplay`
  and `pledge`.
- `runHoldCommand` (extend, release, purchase): load, then
  `wishlist.findHold(holdId)`. Not found means `HoldNotFoundError`. Then
  permit, decide, append, and `save`, as today.
- `GetListView`: reads `holdsForSession` and `pledgedTotal()` from the
  aggregate instead of from `ctx.holds` and `ctx.contributions`.

## Errors

None change. A hold on another list, an unknown id, and a malformed id
all still give `HoldNotFoundError` (IDOR). The `UNIQUE (item_id,
idempotency_key)` constraints stay as the backstop for concurrent
replays.

## ADR-0078

ADR-0078 is amended in place. Nothing is released yet, so ADRs may be
edited until the first release. `docs/adr/README.md` gets a note that
says so.

- **Title:** "Wishlist is the aggregate root for its items, holds and
  contributions".
- **Decision:** the boundary above. `Wishlist` authorizes and owns
  rules that span items, `Item` decides on its holds and contributions,
  and `Hold` and `Contribution` record their lifecycle. Repositories
  load and save the whole aggregate, and there are no use-case-facing
  hold or contribution ports.
- **Alternatives:** add "`Hold` as its own aggregate" as rejected. The
  quantity rule spans an item and its holds, and that shape made use
  cases cascade writes by hand.
- **Consequences:** replace the bounded-load line with "every hold and
  contribution on the list is loaded, like its items; revisit if a
  list's history grows large".

Old plan documents that mention ADR-0078 are historical and stay
unchanged.

## Testing

Each rule is tested once, at the layer that decides it.

- **`Item.test`:** availability and purchased count from its own
  holds, pledge refusals, and the extend, release and purchase
  refusals. These tests move from `Wishlist.test`.
- **`Wishlist.test`:**
  - A hold on another list is not found.
  - `findHoldForReplay` and `findContributionForReplay`: the same
    session gets the original back, another session gets
    `ItemUnavailableError`, and no match gives null.
  - The hold commands check only what the wishlist adds: resolving the
    item and passing the result through.
  - `holdsForSession`.
  - Rules that span items.
- **Use-case tests:** one success path each, checking what is
  persisted, plus the replay branch. The `findOwnedHold` tests are
  removed, because `Wishlist.test` owns that rule now.
- **Contract suites:** the wishlist load includes every hold and
  contribution on the list. `save` inserts new holds and contributions
  and updates changed holds. The bounded-load case is replaced.
- **Routes and e2e:** unchanged. They stay green as the proof that
  behaviour did not change.

## PR split

Each PR changes at most 10 files and passes typecheck and tests on its own.

| Branch | Change |
|---|---|
| `35-adr-0078-boundary` (#74) | ADR-0078 amendment and the README pre-release note |
| `36-load-all-holds` (#75) | Repositories load every hold and contribution on the list; the bounded query stays until the last PR |
| `37-holds-under-item` (#76) | `Item` owns holds and contributions, with `asOf` passed in at load; `Wishlist` delegates; `reconstitute` changes |
| `37a-money-total-cap` (#77) | `Money` allows 0; `MAX_MONEY_MINOR` bounds an item's pledged total |
| `37b-replay-in-domain` (#78) | Replay and session lookups in the domain |
| `38-commands-via-aggregate` (#79) | `HoldItem`, `PledgeContribution` and `runHoldCommand` use only the aggregate; `findOwnedHold` is removed; `save` writes contributions |
| `39-list-view-from-aggregate` (#80) | `GetListView` reads from the aggregate; `Wishlist.owns` is removed |
| `40a-tests-read-rows` (#81) | Tests read stored rows without the port lookups |
| `40b-drop-hold-ports` (#82) | `holds` and `contributions` leave `TransactionContext`; unused port methods and their contract cases are deleted |

Review then refined the design in follow-up PRs:

| PR | Change |
|---|---|
| #83 | Drops an unused holds index and unused fixture exports |
| #84 | `Item` decides extend, release and purchase; `recordEvent` is private; ADR-0078 names those commands |
| #85 | `ItemRepository` returns `ItemRow`, and `hydrate` assembles the items |
| #86 | The replay lookups are named `findHoldForReplay` and `findContributionForReplay` (ADR-0079) |
