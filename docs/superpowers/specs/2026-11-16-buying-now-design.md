# "I'm buying this" first, with an undo — design

Mockup: [`docs/design/buying-now-mockup.html`](../../design/buying-now-mockup.html)
(item card, the buying sheet, the purchased card with its undo, at phone width).

## Why

A guest planning to buy a gift in a shop holds it, buys it, and forgets to
come back and tap "Mark as purchased". The hold lapses after 3 days (6 with the
extension), the gift shows as available again, and a second guest can buy a
duplicate. One of the first guests outside the owner said exactly this: they
expect they would forget to come back and update the page.

Whenever a guest goes quiet, Gubbins has to assume something. A hold assumes
they didn't buy it. "I'm buying this" assumes they did. The guest knows how
sure they are, so they choose: "I'm buying this" for a gift they mean to buy,
"Hold this item" while they're still deciding.

## Owner rulings (2026-11-16)

- "I'm buying this" is the **default** action on a single gift; holding is
  the secondary one.
- The owner **accepts the risk** this brings: a guest who commits, doesn't
  buy, and doesn't come back leaves a gift marked bought that never arrives.
  Before this ruling, a promised-but-missing gift was ranked worse than a
  duplicate (2026-11-07); the guest feedback changed that.
- Guests can **undo** a purchase from "Your contributions".
- **Two releases:** "I'm buying this" first, so invitations can go out
  sooner; undo second.

## Goals

1. Release 1: each available single gift leads with **"I'm buying this"**.
   One confirmation marks the chosen units purchased, with the gifter
   name(s) and the optional message a purchase takes today.
2. Release 1: the result is indistinguishable from holding and then marking
   purchased straight away: same events, same card, same owner view.
3. Release 2: a guest can undo any purchase of theirs from "Your
   contributions", and the units go straight back to other guests.

## Non-goals

- **Reminders:** calendar files, browser notifications, email.
- **Longer holds.** ADR-0002 and `HOLD_DURATION_DAYS` are unchanged; raise
  the setting if guests report running out of time.
- **Group gifts.** They keep "Chip in".
- **An owner-side undo.** The docs name `PurchaseVoided` for an owner action
  that isn't built; release 2 builds only the guest's.
- **Undoing part of a purchase.** Undo returns every unit bought.

## Anti-goals

- **A half-done commitment.** A crash, a slow connection or a double tap
  never leaves the guest with an active hold they didn't ask for, or with
  two purchases.
- **A late retry that re-takes a gift.** A request replayed after an undo
  must never purchase again.
- **Promising an undo that isn't there.** Release 1's sheet says plainly that
  it can't be undone; release 2 changes the wording.

## Release 1: "I'm buying this"

### Item card (`apps/web/src/features/holds/ItemView.tsx`)

- **"I'm buying this" comes first, in the primary style; "Hold this item"
  follows in the secondary style.** Both show exactly when "Hold this item"
  shows today (a single gift with at least one unit free).
- Each button's accessible name includes the item title, as the Hold button
  does now.
- The buttons wrap at narrow widths.

### The buying sheet

A real `<dialog>` (ADR-0024) that behaves like the hold sheet: it mints its
idempotency key when it opens, it can't be dismissed while the request is in
flight, the fields lock once sent, and a retry reuses the key.

- **Title:** Buying "{item title}"?
- **Stepper:** the hold sheet's rules exactly. It appears only when more than
  one unit is free, runs from 1 to the units free, starts at 1, and is
  labelled "How many?" with "of N wanted".
- **Fields:** "Gifter name(s)" (the hold sheet's field, hints and remembered
  names), then "Message to the owner (optional)" (the purchase sheet's
  field).
- **Note box.** It tells the guest to commit *before* buying, so nobody else
  buys the gift in the meantime (owner ruling, 2026-11-16):
  - **Do this before you buy it.**
  - Once you confirm, other guests will see it's taken, so no one else buys
    it while you're getting it. You can't undo this, so only confirm if
    you're sure.
  - It says "once you confirm" rather than "marked as purchased", which read
    as if the purchase had already happened (owner, 2026-11-16).
  - With more than 1 picked, "they" and "them" replace "it".
- **Buttons:** "Yes, I'm buying it" (or "Yes, I'm buying N"), and "Cancel".
  The pending label is "Saving…".
- **When there are no longer enough units:** the hold sheet's 409
  `item_unavailable` retry-in-place ("Only N still wanted now.", stepper capped,
  fields unlocked, same key). With none left, the existing unavailable
  message.

### After it succeeds

- The sheet closes, and the status line uses the purchase success wording
  ("{title} is marked as purchased. Thank you!", or "{title}: N marked as
  purchased. Thank you!").
- Focus moves as it does after a successful hold.
- The gift drops to its new "Wanted: N more", or out of "available". "Your
  contributions" shows the purchased card a hold-then-purchase produces.

### "How holding a gift works" (`HowHoldingWorks.tsx`)

Rewritten to lead with the new default. Proposed copy *(my call; the owner
may reword)*:

- Heading: **How claiming a gift works**
1. **Sure you'll buy it? Tap "I'm buying this" before you buy it.** Other
   guests see it's taken straight away, so nobody buys it in the meantime,
   and there's nothing to come back for.
2. **Not sure yet? Hold it.** It's yours for {duration}, and you can extend
   it once.
3. **Bought a gift you held? Come back and mark it purchased.** If you
   don't, the hold ends and another guest could buy the same gift.

The heading change keeps its existing dismissal key, so guests who dismissed
the card don't see it again *(my call)*.

### Domain rules

The boundary stays Wishlist → Item → Hold (ADR-0078): Wishlist authorizes,
Item decides, Hold records.

- **`Item` gains one command that places a hold and purchases all its units
  at the same instant** (name per ADR-0079, e.g. `buyNow`). It composes
  `placeHold` and `purchaseHold`, so every rule of each applies: units are a
  positive whole number no larger than the units free, and group gifts are
  refused.
- **The new hold is on the item before `purchaseHold` looks it up,** and both
  events are returned together with one starting sequence number.
- **The hold is a normal hold.** Its `expiresAt` comes from the hold policy
  as usual, and never matters, because a purchased hold doesn't expire.
- **Wishlist authorizes it as placing a hold:** a guest session on this list.
  The session that buys is the session that holds, so no separate purchase
  permission check is needed *(my call)*.
- **A guest who already holds the gift can still use it.** It creates a
  second, purchased card and leaves the existing hold alone, as a second
  hold does today *(my call)*.

### Events, storage and API

- **Events:** `ItemHeld` then `ItemPurchased` (units bought = units held),
  same `occurredAt`, appended in one call at one expected sequence number, in
  one transaction. No new event type, no migration.
- **Message:** stored as `MarkHoldPurchased` stores it today (`GuestDetails`
  with name and message, one `guest_pii` row, ADR-0057), written in the same
  transaction.
- **Route:** `POST /api/lists/:slug/items/:itemId/buy`. Body: `idempotencyKey`,
  `name`, `units`, `message?`. Response: the purchased `HoldView`. Errors as
  the hold route (409 `item_unavailable`, 400 validation, 404 unknown item).
  *(My call: its own route rather than a flag on the hold request, so the
  contract says which commitment the guest made.)*
- **Use case:** beside `HoldItem` (e.g. `BuyItem`), reusing its load,
  authorize, PII and replay steps. How it shares code with `HoldItem` is the
  builder's call.
- **Contract:** the OpenAPI document gains the route and a request schema
  (the hold body plus `message`); the response is `holdViewSchema`.

## Release 2: undo a purchase

### "Your contributions" (`YourContributions.tsx`, `HoldActions.tsx`)

- **A purchased card gets "I didn't buy it"** (secondary style). It asks
  first, as "Release hold" does: "Undo your purchase of {title}? Other guests
  will be able to buy it." with "Yes, undo it" and "Keep it" *(wording my
  call)*. With more than 1 unit: "…buy them."
- **After an undo** the card leaves "Your contributions", as a released hold
  does (`GetListView` drops the undone status from `myHolds`, and the sheet
  closes if it was the last entry). The outcome message says "{title} is
  available to other guests again." *(my call)*
- **The buying sheet's note** changes its second line to: "Once you confirm,
  other guests will see it's taken, so no one else buys it while you're
  getting it. If plans change, undo it from Your contributions."

### Rules

- **Any purchase can be undone,** whether it came from "I'm buying this" or
  from a hold. Both are recorded the same way, so telling them apart would
  need a marker for no gain *(my call)*.
- **The whole purchase is undone.** Every unit bought returns *(my call;
  matches Release)*.
- **No time limit** *(my call; lists have no event date to measure from)*.
- **Only the browser that made the purchase can undo it** (the existing
  `placedBy` rule in `HoldPermissions`). The actor recorded is `guest`.
- **An undone purchase counts for nothing:** not in `committedUnits()`, not
  in `purchasedCount()`. The owner's counts drop. The `guest_pii` row
  (name and message) is kept, under ADR-0057's retention like any other.
- **An undone purchase is final.** It can't be re-purchased or undone again;
  the guest buys again with a new request if they change their mind back.
  `Item.purchaseHold` must refuse it with `HoldNotActiveError`, like released
  and purchased holds. Today it lists those statuses by name, so a new status
  would otherwise fall through to `HoldLapsedError`.
- **Undoing twice** (two tabs) answers 200 with the current view, not an
  error *(my call: the guest's intent is already true)*.

### Domain, events, storage and API

- **Event: `PurchaseVoided`** `{ holdId, occurredAt }`. The original holds
  design named it in the docs only, so it is new to the `LedgerEvent` union
  and the `rebuildProjections` switch. ADR-0075 lists it as owner-only; amend it to allow
  the guest.
- **`Hold` records `voidedAt`.** The constructor enforces that it is set only
  on a purchased hold. `statusAt` reports a new status for it (name per
  ADR-0079, e.g. `voided`), and the web shows it as above.
- **Migration `0005`** adds `holds.voided_at` (nullable text) with a
  structural CHECK: `voided_at` is null unless `purchased_at` is set
  (ADR-0083). Shipped migrations are never edited (ADR-0085).
  `rebuildProjections` folds the event.
- **Route:** `POST /api/lists/:slug/holds/:holdId/void`, following the
  existing per-action hold routes, with no body. `HoldView.actions` gains a
  flag for it, true exactly when the hold is purchased and not voided.
- **`HoldView` and the shared status enum** gain the new status.
- **Docs in the same release:** `docs/spec/holds.md` ("Purchase is terminal;
  only the owner can undo it") and the comment on `ItemPurchasedEvent` change
  to say the guest can undo it.

## Concurrency

| Race | Guard | New work? |
|---|---|---|
| Two guests buy the last unit at once | Per-item stream sequence check; `RetryingUnitOfWork` reloads and retries (up to 3); the loser gets 409 `item_unavailable` | No, if buying goes through the same aggregate path |
| Crash between the hold and the purchase | Both events in one `append` call, in one transaction | **Yes:** release 1 |
| Double tap, or a retry over slow wifi | One idempotency key per sheet; a replay returns the first result | No |
| A retry of the buy request arriving after an undo | Replay returns the hold as it is now (undone); it never purchases again | **Yes:** release 2 must test it |
| Undo racing another guest buying the freed units | Sequence check and retry | No |
| Undo twice from two tabs | The second finds it already undone and answers 200 | **Yes:** release 2 |
| The owner edits the quantity or removes the gift mid-purchase | ADR-0019 (quantity may drop below committed); a removed gift answers 404 | No |

## Input handling

No new kinds of input; each field keeps the rules it already has *(my call)*.

| Input | Rule | Owned by |
|---|---|---|
| Gifter name(s) | As the hold request: trimmed, required, domain length | `GuestDetails` |
| Message | As the purchase request: trimmed, blank means none, 300 | `GuestDetails` |
| Units | Whole number, 1 to the units free | `Item`; the stepper caps it too |
| Idempotency key | As the hold request | `IdempotencyKey` |

## Docs

- **New ADR-0088:** "Guests lead with 'I'm buying this', and can undo a
  purchase". It records the problem, the owner's acceptance of the
  missing-gift risk, and the alternatives turned down: longer holds, email,
  browser notifications, a calendar reminder, a final commitment with no
  undo, and holding as the default. Ships with this spec.
- ADR-0075 amendment and `docs/spec/holds.md`: in release 2, as above.

## Tests (at the owning layer)

- **Domain:**
  - `Item`: buying now records a hold whose units bought equal its units, at
    one instant, returning both events; more units than free is refused.
  - `Hold` (release 2): voiding needs a purchased hold; an undone purchase
    counts for nothing; it can't be voided twice.
- **Application:**
  - Release 1: replaying the buy key returns the first result.
  - Release 2: replaying the buy key after an undo returns the undone hold
    and appends nothing; a second undo appends nothing.
- **Routes:** each new route's success path, and one schema refusal.
- **Repository contract and rebuild** (release 2): `voided_at` round-trips,
  and a rebuild re-folds it.
- **Web:**
  - The card shows "I'm buying this" first, exactly when holding is offered.
  - The sheet's note, button wording and stepper follow the count.
  - The fields lock once sent, and "Only N still wanted now." appears after a 409.
  - Release 2: undo asks first, and the card leaves afterwards.
- **e2e:**
  - Release 1: buy 2 of a quantity-5 gift, and another guest sees "Wanted: 3 more".
  - Release 2: undo it, and the other guest sees "Wanted: 5 more".

## Left to the builder

- Whether the buying sheet is its own component or a mode of `HoldDialog`.
- Method, use-case and status names (ADR-0079).
- How `BuyItem` shares code with `HoldItem`.
- The PR split within the 10-file cap. A natural order:
  1. Release 1: domain and use case; route and contract; the web card and
     sheet; the explainer and e2e.
  2. Release 2: domain and event; migration, projection and contract;
     route; web; docs.
