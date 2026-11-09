# The message to the owner moves from holding to purchase — design

Mockup: [`docs/design/purchase-message-mockup.html`](../../design/purchase-message-mockup.html)
(the hold sheet without the message, the purchase sheet with it, and the
one-unit purchase sheet that is new).

## Why

Today the hold sheet asks for "Gifter name(s)" and "Message to the owner
(optional)". A hold only means "I'm thinking about buying this", so writing a
note to the owner before the gift is bought feels premature. The owner found
it odd in testing. The note belongs with the purchase.

## Goals

1. The hold sheet asks for gifter name(s) only. The message box is gone.
2. Marking a hold purchased offers the optional "Message to the owner" box,
   for a hold of one unit and of several, and for an expired hold that can
   still be marked purchased.
3. A one-unit hold now opens a small purchase sheet (mockup option A) instead
   of being marked purchased in one click, so the box has somewhere to live.
4. Every message already stored for a hold is deleted, including on holds that
   were already purchased.

## Non-goals

- **Showing messages to the owner.** No owner screen shows them today and
  this change doesn't add one. ADR-0022 (messages are not spoiler-gated)
  still describes how they will be shown.
- **Group gifts.** A pledge keeps its message box, and stored pledge messages
  are kept.
- **Editing a message after purchase.** A purchase is final, and so is its
  message.

## Anti-goals

- **A hold that fails because an old page sent a message.** A browser still
  running the previous web build may send `message` with a hold. The hold
  must succeed and the message must be dropped. The hold request schema is a
  non-strict zod object, so removing the field already strips it; keep it
  that way rather than rejecting unknown fields.
- **Losing what the guest typed when they can retry.** The sheet keeps
  today's multi-unit rules for every purchase: on a network error or a 409
  `item_unavailable` it stays open with the message still in the box. When
  the hold is no longer the guest's (409 `hold_not_active`, 404, or a refetch
  that removes the purchase action) it closes and reports the error as
  today, since nothing is left to buy. An over-long message can't come from
  the page: the box stops at 300.

## Guest experience

### Hold sheet (`apps/web/src/features/holds/HoldDialog.tsx`)

The "Message to the owner (optional)" label and box are removed. The name,
stepper, lock-once-sent and idempotent-retry behaviour are unchanged; the
retry now carries name and count only.

### Purchase sheet (`apps/web/src/features/holds/PurchaseDialog.tsx`)

- **One unit held:** "Mark as purchased" on the "Your holds" card opens the
  sheet. Its title is "Mark “{item title}” as purchased?". It has the message
  box and two buttons: "Mark as purchased" and "Cancel". No stepper, no
  "released" note.
- **More than one unit held:** the existing "How many did you buy?" sheet,
  with the message box added under the count and the "released" note.
- **The box:** label "Message to the owner (optional)", the same
  `LimitedTextarea` and 300-character counter the hold sheet used. It locks
  while the request is in flight, like the stepper.
- Success and failure announcements are as today. The sheet now opens for
  every purchase, so a one-unit purchase's errors show in the sheet the way
  the multi-unit sheet's already do.

## API

- `POST /api/lists/:slug/items/:itemId/holds`: `message` is removed from
  `holdItemRequestSchema` (`packages/shared-types/src/holdItem.ts`), from
  `HoldItem`'s input, and from the `GuestDetails` the hold writes, which now
  has a null message.
- `POST /api/lists/:slug/holds/:holdId/purchase`:
  `markHoldPurchasedRequestSchema` gains `message?: string`. In the same
  transaction as the purchase, `MarkHoldPurchased` sets the message on the
  hold's `guest_pii` row (`hold.piiRef`). An empty or missing message leaves
  the row's message null.
- The OpenAPI document and `apps/web/src/api/schema.gen.ts` are regenerated.

## Input rules

One field changes where it is collected. Its rules don't change:

| Field | Trim | Blank | Max | Owned by |
|---|---|---|---|---|
| Message (at purchase) | yes | means no message (null) | 300 | `GuestDetails` (domain), as today; the web counter mirrors it |

The message is validated by building a `GuestDetails` from the row's
existing name and the new message, so the 300 limit and trimming stay in one
place. An over-long message fails with 400 and nothing is purchased.

## Data

- **Where the message lives:** the hold's existing `guest_pii` row, the same
  as today. It never enters an event, so ADR-0057 erasure still covers it.
  `GuestPiiRepository` gets a way to set a row's message; its contract test
  covers it.
- **Deleting stored hold messages:** a new migration,
  `0002_clear_hold_messages`, sets `message = NULL` on every `guest_pii` row
  referenced by a hold (`holds.pii_ref`). Rows referenced by contributions
  keep their message. No schema change.
- **Depends on tracked migrations** (PR #206, release-versioning spec): the
  migration needs the `Migrator` and `migrations/index.ts` that PR adds, so
  it is built after #206 merges (or stacked on it). It must run exactly once:
  if it ran on every startup it would wipe messages given at purchase.

## Decision records

ADR-0057 is amended in place (ADRs are editable until 1.0): the hold's
message is collected when the hold is marked purchased, not when it is
placed. No new ADR.

## Builder's calls (decided while writing this, not by the owner)

- One purchase sheet for both cases: `PurchaseDialog` shows the stepper and
  "released" note only when more than one unit is held.
- A hold with no `guest_pii` row (`piiRef` null, possible only for holds made
  before names were required, none of which exist in production) is
  purchased normally and the message is dropped.
- The single-unit sheet's title wording above.
- Migration name and the repository method's name.

## Testing (at the owning layer)

- Domain: no new rules; `GuestDetails` tests already cover trim, blank and 300.
- Use case: `MarkHoldPurchased` stores the message on the hold's row; an
  over-long message purchases nothing. `HoldItem` stores no message.
- Repository contract: setting a row's message.
- Migration: an integration test that clears hold messages and keeps pledge
  messages.
- Web: `HoldDialog` has no message box; `PurchaseDialog` sends the message,
  shows the stepper only for more than one unit, and keeps the text on
  failure; `HoldActions` opens the sheet for a one-unit hold.
- e2e: the existing purchase journey goes through the sheet, with a message.
