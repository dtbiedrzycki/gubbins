# Wishlist → Item → Hold / Contribution boundary

- **Date:** 2026-10-15
- **Status:** Approved design, awaiting implementation plan
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
- No behaviour change. Route and e2e tests pass unchanged.

## Non-goals

- No schema change or migration.
- Commands keep returning their ledger events. Collecting events on
  entities stays rejected.
- Event streams stay per item (ADR-0008), with seq-based concurrency
  (ADR-0010).
- `GuestPii` and the other plain-CRUD records stay outside the
  aggregate (ADR-0057). The use case keeps minting `piiRef` beside the
  `guest_pii` insert.

## Domain model

```
Wishlist (root)   authorizes: getItem, owns; rules that span items
 └─ Item          decides: placeHold, pledge, availability, purchased count
     ├─ holds          every hold on the item
     └─ contributions  every contribution on the item
        Hold / Contribution record their own lifecycle
```

- `Item` owns `holds` and `contributions` and derives its counts from
  them. `availableUnits()` and `statusGiven()` lose their count
  arguments.
- `Item` gets the aggregate's `asOf` when it is built or loaded, never
  per call, so commands and queries still take no date. `Hold.statusAt`
  is called with that instant.
- `Wishlist` keeps the command entry points (`holdItem`, `extendHold`,
  `releaseHold`, `purchaseHold`, `pledge`). Each resolves the item and
  delegates to it. `Wishlist._holds` is removed, and `findHold(id)`
  searches the items, so a hold on another list is never found.
- New domain methods:
  - `replayHold(itemId, idempotencyKey, sessionHash)`: returns the
    original hold for the same session, throws `ItemUnavailableError`
    for another session's key, or returns null when there is none.
  - `replayContribution(itemId, idempotencyKey, sessionHash)` works the
    same way.
  - `holdsForSession(sessionHash)`: every hold that session placed on
    the list.
  - `Item.pledgedTotal()`: derived from its contributions.

## Loading and saving

- `WishlistRepository.findById(id, now)` and `findBySlug(slug, now)`
  load the list, every item, and **every** hold and contribution on the
  list, the same way items are loaded today. There is no partial load
  and no load options.
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

- `HoldItem`: load the wishlist, then `replayHold`. On a replay, return
  its view. Otherwise call `holdItem`, append the event, insert the
  guest PII, and `save`.
- `PledgeContribution`: the same shape with `replayContribution` and
  `pledge`.
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
  holds, and pledge refusals. These tests move from `Wishlist.test`.
- **`Wishlist.test`:**
  - A hold on another list is not found.
  - `replayHold` and `replayContribution`: the same session gets the
    original back, another session gets `ItemUnavailableError`, and
    no match gives null.
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
| `35-adr-0078-boundary` | ADR-0078 amendment and the README pre-release note |
| `36-load-all-holds` | Repositories load every hold and contribution on the list; the bounded query stays until the last PR |
| `37-holds-under-item` | `Item` owns holds and contributions, with `asOf` passed in at load; `Wishlist` delegates; `reconstitute` changes |
| `38-commands-via-aggregate` | Replay rules in `Wishlist`; `HoldItem`, `PledgeContribution` and `runHoldCommand` use only the aggregate; `findOwnedHold` is removed; `save` writes contributions |
| `39-list-view-from-aggregate` | `GetListView` reads from the aggregate |
| `40-drop-hold-ports` | `holds` and `contributions` leave `TransactionContext`; unused port methods and their contract cases are deleted |

The PRs open after 33 and 34, and only while the stack has fewer than
8 open PRs.
