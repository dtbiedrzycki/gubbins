# The owner puts gifts in order — design

Mockup: `docs/design/reorder-items-mockup.html` (open it in a browser; the buttons work).

## Why

Today a list shows gifts in the order they were added, oldest first (`ItemRepositoryKysely.findAllByWishlistId` sorts by `created_at`, then `id`). The owner can't change that order. Owners want two things:

- **The most wanted gifts at the top**, so guests see them first.
- **Similar gifts next to each other.** Being next to each other is enough; there are no named sections.

Lists hold about 5 to 40 gifts.

## Goals

- On the manage page, the owner can move any gift up one place, down one place, to the top, or to the bottom.
- Every move is saved on the server straight away. Guests, and the owner on any device, see the same order.
- A new gift goes to the top of the list, just below the add form, which also sits at the top of the page.
- Lists that already exist keep their current order (oldest first) when this ships. Nothing visibly moves on deploy.

## Non-goals

- Drag-and-drop. The owner left it out for now, although it would make long moves on a 40-gift list quicker.
- Named or headed sections and groups.
- Long-press shortcuts. They were considered and rejected: nobody discovers them, they clash with the phone's own long-press, and keyboard users can't do them.
- A ⋯ menu for Top and Bottom. It was considered and rejected in favour of keeping all four buttons visible.
- Sorting by price, name or anything else.
- Guests reordering anything, or a per-guest order.

## Anti-goals

- A "reorder mode" or a "Save order" button. Each tap is the whole action.
- Rows that get taller. The move block has to fit beside the gift's name, price and Edit/Delete row without growing the row. The owner chose this layout specifically so a 40-gift page doesn't get longer.
- Reordering that changes or blocks anything a guest has done. Holds, purchases and pledges are unaffected. A gift that guests have touched moves exactly like any other gift, and so does a group gift.

## Owner experience (manage page, `apps/web/src/features/manage/ManageItems.tsx`)

The owner chose layout **B2** in the mockup.

- Each gift row has a **two-by-two block of icon buttons on its right**:
  - top row: **Up** (one place) and **Top**
  - bottom row: **Down** (one place) and **Bottom**
- The gift's name, price line, and Edit and Delete buttons stay on the left, unchanged. Delete's "can't be deleted" hint, its confirmation and its error also stay in the left column.
- The block takes about 100 px, so the left column narrows (at 360 px wide, from about 312 to about 208 px). Rows stay the same height unless a long title or the Delete hint wraps onto more lines. That trade-off is accepted.
- The four buttons form a group labelled "Move ‹title›". Each has its own accessible name, such as "Move ‹title› up" or "Move ‹title› to the top". Each is at least 44 × 44 px.
- A button that can't do anything is disabled: Up and Top on the first gift, Down and Bottom on the last. With one gift, all four are disabled.
- After a move:
  - the list shows the new order;
  - **focus stays on the same button of the moved gift**, so the owner can tap Up repeatedly;
  - if that button has become disabled (the gift reached an end), focus goes to the first enabled button in that gift's block;
  - a live region announces "‹title› moved to position N of M." This is one `role="status"` element for the whole list, always mounted, following `AddItemForm`'s pattern.
  - The mockup's brief highlight on the moved row is optional. If you build it, respect `prefers-reduced-motion`, and keep text contrast at 4.5:1 or better while it shows; a bar on the left edge does this, a background fill may not.
- While a gift is being edited (its row shows the edit form), its move block is hidden along with the rest of its row. The other gifts can still be moved.
- If a move fails:
  - the list refetches and shows the server's order;
  - the error appears in the moved gift's row, in the same kind of `role="alert"` paragraph Delete uses, and focus moves to it, as with Delete;
  - there is no "moved" announcement;
  - the error clears at the start of that gift's next move.
  - So focus stays on the button only after a successful move.
- A 404 means the owner cookie is no longer accepted: call `onUnauthorized()`, as Delete does. A gift deleted on another device also returns 404 and sends the owner back to the token gate. Delete on `main` behaves the same way, and that is accepted here too.

## Guest experience

The guest list (`GetListView`) shows gifts in the owner's order. Nothing else changes on the guest page. This work is built from `main`, independently of the "Your contributions" work. Once that lands, it follows the owner's order for free, because it reads the same item list.

## API

There is one new owner-only endpoint, protected in the same way as `PUT/DELETE /api/lists/:slug/items/:itemId`. Its exact shape is my call (see "Builder's calls"); the suggested shape is:

`POST /api/lists/:slug/items/:itemId/move` with body `{ "to": "top" | "up" | "down" | "bottom" }`

- **204** with no body on success, including a no-op such as moving the first gift up. A no-op is not an error, because the UI disables those buttons and a stale second tab shouldn't produce an error.
- **400** for a missing or unknown `to`.
- **404** for an unknown list, an unknown item, an item on another list, or no owner access. These follow the existing owner routes' rules.

The web client's `unwrap` (`apps/web/src/api/client.ts`) throws when there is no data, and openapi-fetch returns no data for a 204. This is the first 204 route, so the client's `moveItem` must treat a bodyless 204 as success rather than go through `unwrap` as it is.

`GET` manage view and `GET` list view return items in the owner's order. The response shapes don't change; the order of the `items` array is the contract. The shared OpenAPI types are updated for the new route, keeping the dependency list explicit as the repo already does.

## Data

- Production has real data, so this needs a **new migration** (`0002_…`). Shipped migrations are never edited (ADR-0085).
- **My call:** add an integer `position` column to `items`. The migration backfills each list's existing gifts so the current oldest-first order is kept. Sorting changes from `created_at, id` to `position`, with `id` as a tiebreak only as a safety net.
- **Numbering is left to you,** as long as these hold. One way to do it: a new gift takes `min(position) − 1`; Top and Bottom take min − 1 and max + 1; Up and Down swap with the neighbour. Gaps left by deletes are harmless, and no renumbering pass is needed.
  - Positions are unique within a list after every operation.
  - A move never touches another list's gifts.
- **My call: no unique index on `(wishlist_id, position)`, and no CHECK.** SQLite checks UNIQUE row by row, so a swap done as two UPDATEs would collide with itself. Uniqueness is the aggregate's rule (see "Domain").
- **`position` is carried by `Item`, and only `Wishlist` sets it.** `WishlistRepositoryKysely.save` writes only the item columns that changed, so it must compare and write `position` the same way it does the other columns. The in-memory `InMemoryWishlistRepository` must keep the order too. The adapter never works out positions itself.
- If the contributions or security-headers work lands a migration first, take the next number.

## Domain

- A move is an owner edit of the list. It is **not a ledger event**. Editing a gift doesn't record one either, and the owner-editing audit trail was deferred as YAGNI.
- **`Wishlist` owns the order.** Its `_items` array is already ordered. The rules live in the aggregate:
  - a new gift goes first;
  - what each `to` does;
  - moving past an end is a no-op;
  - positions stay unique.
  
  The exact method shape follows the repo's DDD conventions (skill `reviewing-for-recurring-feedback`).
- Comments and test names that state the old rule change with it:
  - `Wishlist.items`'s doc comment ("in the order they were added");
  - `ItemRepository.findAllByWishlistId`'s doc comment;
  - the tie-break comment in `ItemRepositoryKysely`;
  - the contract test "loads every item of the list, in the order they were added".
- Concurrency: two owner devices moving gifts at the same moment means the last write wins. Run each move in one transaction through the existing unit of work, so positions never end up duplicated.

## Decision records

Add one ADR (next free number; `0086` at the time of writing, so check the other open branches) that records:

- The owner sets the order that guests see.
- New gifts go first.
- Moves are not ledger events.

## Builder's calls (decided while writing this, not by the owner)

- Existing lists keep oldest-first as their starting order.
- Endpoint shape: one `move` route with `to`, returning 204, where an end-of-list move is a no-op rather than 409.
- An integer `position` column, rather than a linked list or an order array on the wishlist.
- Moves are not ledger events.
- Last write wins across devices.
- On a failed move, refetch and show the error the way Delete does, with focus going to the error. Don't roll back an optimistic update by hand. (The UI may wait for the response, like Delete; a round trip to a single-user SQLite server is fast enough.)
- Focus and announcement behaviour, as in the mockup.
- No unique index on `(wishlist_id, position)`; `Wishlist` keeps positions unique. (Added after the owner's approval, from review.)
- **Taps while a move is in flight are ignored.** While a move is pending, every move button on the list is marked `aria-disabled="true"` and its click does nothing. The real `disabled` attribute is not used, because it would drop focus. Once the list has refetched, the buttons are live again. The announcement is worked out from the refetched order, so it is never stale and is never doubled.

## Testing (at the owning layer)

Follow skill `testing-at-the-owning-layer`: one test per rule, at the layer that decides it.

- **Domain (`Wishlist`):**
  - each of the four moves;
  - no-op at each end;
  - a new gift lands first.
- **WishlistRepository contract** (runs against both `InMemoryWishlistRepository` and `WishlistRepositoryKysely`):
  - a reordered list loads in its new order. This replaces the "in the order they were added" test.
  - saving a reorder of one list leaves another list's order unchanged.
- **Migration:** the backfill keeps oldest-first per list.
- **Route:** 204, 400 for a bad `to`, and 404 for no owner access or a foreign item. Exact payload assertions.
- **Web (`ManageItems`):**
  - the buttons send the right `to`;
  - disabled states at the ends;
  - focus stays on the same button, or falls back at an end;
  - the live announcement;
  - a tap while a move is pending sends nothing;
  - error and 404 handling.
- **E2E:** one journey. The owner adds three gifts, moves one to the top, and the guest page shows that order.
