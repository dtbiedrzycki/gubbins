# "Your contributions", "Wanted" counts and store names — design

Mockup: [`docs/design/guest-contributions-mockups.html`](../../design/guest-contributions-mockups.html)
(option B, the floating button and its sheet, was chosen; option A is kept
for the record).

## Why

The owner tried the guest list page and found three problems:

1. **"Your holds" is hard to reach.** It sits under every gift on the list
   page (`apps/web/src/pages/ListPage.tsx`). A guest who comes back to mark a
   gift as bought or to extend a hold has to scroll the whole list. Holding a
   gift also moves focus down to that section, so the guest loses their place
   in the list while adding holds. The name is wrong too: the section already
   shows purchased and expired holds, not only live ones, and a guest's
   chip-ins to group gifts belong with them.
2. **"5 left" reads like shop stock.** It sounds as if the store has five
   onesies left, not that the owner would like five more.
3. **"View in store" doesn't say which store.**

## Goals

1. A guest reaches their holds and chip-ins with one tap from anywhere on the
   list, and never loses their place in the list by holding a gift.
2. The section is called "Your contributions" and lists the guest's
   chip-ins to group gifts as well as their holds.
3. Unit counts read as what the owner still wants.
4. Each store link names the site it goes to.

## Non-goals

- **Actions on chip-ins.** A pledge can't be changed or withdrawn in the app
  today, so its entry is read-only.
- **Friendly store names** ("Vendor" rather than "vendor.com"). The owner
  asked for the domain.
- **Expanding short links.** `vndr.to/…` reads "View on vndr.to"; the owner
  accepted this. The server never visits item links to resolve them.
- **A `StoreUrl` value object.** It stays a parked follow-up; the domain is
  worked out in the web app, since it's display text only (owner ruling,
  2026-11-10).
- **Owner screens.** The manage page keeps its own wording.

## Anti-goals

- **The floating button covering a gift.** The end of the list always has
  room for it, so the last gift can be scrolled fully clear (owner
  requirement).
- **Losing the guest's place.** No hold or chip-in action scrolls the page or
  moves focus out of the gift card the guest is on.
- **Outcome messages lost when the sheet closes.** See "Messages" below.

## Order of work

1. **After the purchase-message stack (#211–#217) merges.** It rewrites the
   purchase sheet and the hold cards that this design moves into the new
   sheet (owner ruling, 2026-11-10).
2. **First, one shared piece of code for the modal sheets** (owner ruling,
   2026-11-10). `HoldDialog`, `ContributeDialog` and `PurchaseDialog` each
   copy the same `<dialog>` show / cancel / reopen logic (ADR-0024). Pull it
   into one hook (working name `useModalDialog`) before the contributions
   sheet becomes the fourth copy. The parked follow-up also notes that the
   purchase sheet closes silently when a refetch removes its action; the
   builder fixes that in the hook if it falls out naturally, otherwise
   leaves it parked.
3. The API returns the guest's chip-ins.
4. The web changes, in whatever order and PR split the plan prefers.

The two wording changes ("Wanted", "View on …") don't depend on the rest
and can go first.

## Guest experience

### "Your contributions" button and sheet

- **The button** floats at the bottom centre of the list page, above the
  page content: "Your contributions · N", where N is the number of entries
  the sheet lists. It appears only once the guest has at least one entry, and
  the first time it appears while the page is open it gets the existing
  wax-seal stamp animation (`Seal`'s `stamp`).
- **Room at the end of the list.** While the button shows, the page's bottom
  padding is at least the button's height plus its gap, so the last gift
  (or the empty-list message) can scroll clear of it.
- **The sheet** is a modal `<dialog>` (ADR-0024) titled "Your
  contributions", with a Close button, Escape and backdrop-tap to close.
  Closing it returns focus to the floating button, and the list stays where
  it was scrolled. On a phone it rises from the bottom, as in the mockup.
- **Contents**, in this order:
  1. Holds, exactly as today's "Your holds" lists them (released holds are
     already left out by `GetListView`): seal, title, "× N" for several
     units, status line and the server's `actions`. Mark as purchased opens
     the purchase sheet on top of this one.
  2. Chip-ins, newest first: a green coin seal, the gift's title and "You
     chipped in $40.00." One entry per pledge, so two pledges to the same
     gift are two entries.
- **The empty state goes.** Today's "Holds you place appear here." isn't
  needed, since the button only shows once there is something to list.
- **`ListPage`'s `focusElsewhere`** stops pointing at `your-holds-heading`.
  After a hold succeeds, focus stays in the gift's card (see below).

### After holding a gift

The gift's card gains a line "You're holding N" (N = units across the
guest's holds on that item whose status is `active`; expired, purchased
and released holds don't count, since the sheet already shows them with
their own status — my call), in place of moving focus to the section. Focus goes to that line or the card's heading (builder's call),
and the button's count goes up.

### Group-gift card

A group gift's card shows "You chipped in $40.00" whenever this guest
session has pledged to it, summing the amounts if they pledged more than
once (owner ruling, 2026-11-10). It sits with the pledged-total line, above
Chip in, and stays after the gift is fully funded. This is how ADR-0050's
same-session "already sent" hint is met: a guest tapping Chip in sees they
have already pledged. The existing thank-you announcement after a pledge
is unchanged.

### Messages

Today the section owns two live regions (`role="status"` and
`role="alert"`) for action outcomes, mounted even when empty (ADR-0025).
Outcomes now show inside the sheet, where the action was taken. When an
action removes the guest's last entry, so the sheet would be empty, the
sheet closes and the outcome is announced in a live region on the page that
stays mounted (the button's region or the page's existing status line;
builder's call). The "released" message rule (cleared when a new hold
appears) carries over unchanged.

### "Wanted" counts

| Where | Today | New |
|---|---|---|
| Gift card (`ItemView.tsx`) | "5 left" | "Wanted: 5 more" |
| Hold sheet, beside the stepper (`HoldDialog.tsx`) | "of 5 left" | "of 5 wanted" |
| Hold sheet, someone held some first | "Only 1 left now." | "Only 1 still wanted now." |

When each line shows is unchanged. Comments mentioning "left" for this
count (`Stepper.tsx`'s `describedBy` doc) follow. The purchase sheet's
"still free to mark as purchased" note is about the guest's own hold and
stays.

### Store link

"View in store" becomes "View on {host}", where host is the link's
hostname, lowercased by the URL parser, with one leading `www.` removed:
`https://www.vendor.com/item/…` → "View on vendor.com",
`https://shop.example.co.uk/x` → "View on shop.example.co.uk",
`https://vndr.to/abc` → "View on vndr.to". The screen-reader text after it
("for {title} (opens in a new tab)") stays. Item URLs are already
validated as https when saved (`Item.ts`); if parsing ever fails, show "View in
store" rather than break the card.

## API

`GET /api/lists/{slug}` (`GetListView`) gains `myContributions`, beside
`myHolds`: this guest session's pledges on the list, newest first, each
`{ contributionId, itemId, amountMinor, pledgedAt }`. Contributions already
store `sessionHash` and have `belongsToSession`; the Wishlist aggregate gets
a `contributionsForSession` beside `holdsForSession`. No guest name, message
or payment details go out: the guest typed them, but the list view doesn't
need them. No schema or migration change. The OpenAPI document and shared
types are regenerated (ADR-0077). This is the deferred "guests can see their
own past pledges" follow-up (ADR-0050's "already sent" hint), now decided.
The group-gift card derives its "You chipped in" total from this same
field.

## Docs

- Guest-facing spec text in `docs/spec/` that uses the old wording, if
  any, is updated (none was found when this was written).
- ADR-0050 is amended in place (ADRs are editable until release): its
  same-session hint is the "You chipped in $X" line on the gift card plus
  the entry in "Your contributions".
- `docs/design/guest-contributions-mockups.html` is committed with this
  design.

## Tests (at the owning layer)

- Domain: `contributionsForSession` returns only that session's pledges.
- Use case: `GetListView` returns `myContributions`, newest first, and none
  without a guest session.
- Route: the response matches the schema (one test, existing pattern).
- Web: the host label (www stripped, subdomain kept, unparsable falls back);
  the button shows only with entries and its count; the sheet lists holds
  then chip-ins; closing returns focus to the button; an action that empties
  the sheet still announces its outcome; the gift card's "You're holding N"
  (active holds only); the group-gift card's "You chipped in" total across
  two pledges;
  the new "Wanted" wording.
- The shared dialog hook: show on mount, cancel, reopen, covered once at the
  hook rather than in each dialog.
- e2e: existing specs that look for "N left", "View in store" or "Your
  holds" are updated; one spec opens the sheet from the button and marks a
  hold as purchased.

## Left to the builder

- Hook name and exact API of the shared dialog code.
- Whether the purchase sheet's silent-close fix lands in the hook.
- Exact bottom padding value and how the button is positioned (fixed vs
  sticky), as long as it never covers content at the end of the list.
- Which element gets focus after a hold, and which live region carries the
  outcome when the sheet empties.
- The PR split, within the 10-file cap.
