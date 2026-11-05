# Holding more than one unit of a gift — design

Mockup: [`docs/design/multi-unit-hold-mockups.html`](../../design/multi-unit-hold-mockups.html)
(item card, hold sheet, "Your holds" card and the purchase sheet, at phone width).

## Why

An owner can list a single gift with a quantity above 1, such as 5 baby
onesies, and a guest may want to buy 2 of them. Today each hold reserves
exactly one unit (`Item.placeHold`, `apps/api/src/domain/entities/Item.ts`),
so the guest has to hold the item twice and gets two separate holds and two
cards. A guest should pick how many they're buying in the hold sheet and get
one hold for all of them.

## Goals

1. A guest picks a quantity in the hold sheet with a −/+ stepper. It starts
   at 1. One hold covers every unit they picked.
2. A guest holding more than one unit can mark fewer of them as purchased.
   The units they didn't buy are released in the same step, and the sheet
   tells them so before they confirm.
3. Other guests and the owner see unit counts drop and return as they do
   today ("3 left", the owner's committed count).

## Non-goals

- **Releasing part of a hold.** Release lets go of the whole hold, with no
  picker.
- **Adding units to an existing hold.** A guest who wants one more holds the
  item again and gets a second hold and a second card.
- **Extending part of a hold.** Extend always applies to the whole hold.
- **Group gifts.** They stay one unit with pledges, not holds.
- **The per-session hold cap from ADR-0046.** It isn't built yet and stays
  out of scope. When it is built, it counts holds, not units, so one hold of
  3 onesies uses one slot.
- **Migration.** No holds exist in production, so hold events, tables and
  migrations change in place (migrations are edited in place until the first
  release).
- **Owner-side UI.** `GetManageView` already sends `committedUnits()`, which
  will count units. The owner screens are left as they are.

## Anti-goals

- **Quietly holding fewer than the guest picked.** If units were taken while
  the sheet was open and there are no longer enough, the hold fails and
  nothing is held.
- **Releasing units the guest didn't expect to lose.** Buying fewer than they
  held always shows "The other N will be released…" before they confirm.

## Guest experience

### Item card

No change. The button still says "Hold this item", and the existing "N left"
line (shown when more than one unit is free) carries the count.

### Hold sheet (`apps/web/src/features/holds/HoldDialog.tsx`)

- **The stepper only appears when more than one unit is free.** When it
  does, it sits under the intro text, labelled "How many?", with "of N left"
  beside it. With one unit free, the sheet reads exactly as it does today.
- **Its range runs from 1 to the units free.** It starts at 1, "−" is
  disabled at 1, and "+" is disabled at the units free. The buttons have
  accessible names ("One fewer", "One more"), and the stepper is a labelled
  group whose value is announced.
- **The wording follows the count.** With more than 1 picked, the sheet says
  "them" and "they're" instead of "it" and "it's" ("Other guests will see
  they're taken while you buy them", "After you buy them, come back…"). The
  confirm button reads "Yes, hold N"; with 1 it stays "Yes, hold it".
- **The count locks once sent,** like the name and message do today: a retry
  of the same request carries the count it was first sent with.
- **When there are no longer enough units,** the API answers 409
  `item_unavailable` and the list view refetches (`useHoldItem` already
  invalidates it in `onSettled`). The sheet then:
  - shows "Only N left now.";
  - unlocks the count, name and message, and keeps the same idempotency key
    (a 409 records nothing, so the key is still unused);
  - caps the stepper at N and lowers the count to N if it was above;
  - hides the stepper when N is 1, by the "more than one unit free" rule.

  The guest can confirm again from the same sheet. With none left, the sheet
  shows the existing unavailable message. *(My call: retry in place, so the
  guest doesn't retype their name.)*

### "Your holds" (`YourHolds.tsx`, `HoldActions.tsx`)

- **A hold of more than one unit shows "× N" beside the item title.** A hold
  of one unit looks the same as today.
- **Extend and Release act on the whole hold,** exactly as today.
- **Mark as purchased on a hold of one unit** marks it straight away, as
  today.
- **Mark as purchased on a hold of more than one unit opens a purchase
  sheet:**
  - The sheet opens whenever the hold covers more than one unit (`units > 1`),
    even if only one can still be bought. This way an expired hold of 3
    never buys 1 silently. *(My call.)*
  - The title is "How many did you buy?", followed by a stepper with "of N
    held".
  - The stepper starts at `purchasableUnits` and runs from 1 to
    `purchasableUnits`. On an active hold that's the full number held. On an
    expired hold it can be fewer (see "Units bought on an expired hold"
    below). *(My call.)*
  - On an active hold, when the count is below the number held, a note
    appears before the confirm button: "The other N will be released, so
    another guest can hold it." (or "…hold them." when N > 1).
  - On an expired hold, the release note never shows, because those units
    were freed when the hold lapsed. When `purchasableUnits` is less than the
    units held, the sheet says "Only N are still free to mark as purchased."
    instead. *(My call.)*
  - If the purchase returns 409 because free units dropped while the sheet
    was open (see below), the list view refetches. The sheet then shows the
    new limit and caps the stepper there, the same retry-in-place as the hold
    sheet.
  - The confirm button reads "Mark N as purchased", next to a Cancel button.
  - The sheet is a real `<dialog>` (ADR-0024). It follows `HoldDialog`'s
    behaviour: it can't be dismissed while the request is in flight, and
    focus is handled the way `YourHolds` handles it today.
- **After a purchase:**
  - The card shows the gold seal, "× N" for the units bought (only when more
    than 1), and "Marked as purchased."
  - The success message names the count when more than one unit was held:
    "Baby onesies, 0–3 months: 1 marked as purchased. Thank you!"
  - Released units go back into other guests' "N left".

## Domain rules

The boundary stays Wishlist → Item → Hold (ADR-0078): Wishlist authorizes,
Item decides, Hold records.

- **A hold holds a whole number of units, 1 or more.** It's set when the hold
  is placed and never changes. The check lives in the `Hold` constructor, so
  every construction path enforces it, `reconstitute` included.
- **A purchased hold records how many units were bought,** from 1 up to its
  units. A hold that isn't purchased has none. This is also enforced in the
  constructor.
- **`Item.placeHold` takes the units.** It refuses with `ItemUnavailableError`
  when the units asked for are more than `availableUnits()`, and with
  `DomainValidationError` when the units aren't a positive whole number.
- **Item derives every unit count from its holds,** never storing one:
  - `committedUnits()` = units of active holds + units bought on purchased
    holds.
  - `purchasedCount()` = units bought on purchased holds.
  - Released and expired holds count for nothing, as today.
- **`Item.purchaseHold` takes the units bought,** and Item decides the most a
  guest may buy:
  - On an active hold: up to its units.
  - On an expired hold: up to the smaller of its units and the units free.
    `hold_lapsed` (`HoldLapsedError`) applies when no unit is free, as today.
  - Fewer than 1, or more than the units held: `DomainValidationError`
    (400), because that's bad input.
  - On an expired hold, within the units held but more than the units free:
    `ItemUnavailableError` (409 `item_unavailable`). This is a race with
    another guest, like `placeHold`'s refusal. *(My call.)* Correct the
    purchase route's 409 description in `routes.ts` to name `hold_lapsed`
    and `item_unavailable` as each actually occurs.
- **One private rule backs both the command and the view.** It computes the
  most a guest may buy and feeds `purchaseHold` and the view's purchase
  limit, following the existing `purchaseRefusal`/`canPurchaseHold` pattern.
- **Units not bought go back to other guests** the moment the hold is marked
  purchased. This follows from the derivation above; nothing is stored for
  the released remainder.
- **Extend and release** keep their rules and act on the whole hold.

## Input handling (owner ruling, 2026-11-05)

| Input | Allowed values | Owned by | Out of range |
|---|---|---|---|
| Units to hold | Whole number, 1 to the units free | Domain (`Item.placeHold`); the stepper caps it too | 409 `item_unavailable`; the sheet shows the new count; nothing is held |
| Units bought (hold of more than 1 unit) | Whole number, 1 to the units held | Domain (`Item.purchaseHold`); the stepper caps it too | 400 validation error |
| Units bought on an expired hold | Whole number, 1 to the smaller of the units held and the units free | Domain | 409 `hold_lapsed` when none are free (as today); 409 `item_unavailable` when some are free but fewer than asked; the stepper caps at the limit |

Both are integers, so there's no trimming and no text length. Request
schemas type them as integers ≥ 1 and leave the ranges to the domain.

## Events, storage and API

- **`ItemHeld` gains `units`; `ItemPurchased` gains `units` (the units
  bought).** Both stay at `v: 1`, since no production events exist.
  `rebuildProjections` folds both into the holds table.
- **The `holds` table gains `units` and `purchased_units`,** edited into the
  existing migration. CHECKs back up structural invariants only (ADR-0083):
  - `units >= 1`
  - `purchased_units` is null exactly when `purchased_at` is null
  - `purchased_units` runs from 1 to `units`
- **Hold request (`holdItem`): a required `units` integer.** The web always
  sends it, 1 when there's no stepper. *(My call: required, so the contract
  says what the client chose rather than relying on a server default.)*
- **Purchase request (`markHoldPurchased`): a required JSON body with a
  `units` integer.** The web sends the units held for a hold of one unit.
  *(My call: same reason.)*
- **Idempotent replay of a hold returns the first hold unchanged,** whatever
  `units` the retry carries, as with name and message today.
- **`HoldView` gains:**
  - `units`: the units the hold holds.
  - `purchasedUnits`: the units bought, or null.
  - `purchasableUnits`: the most the guest may mark as purchased now, or 0
    when the purchase action is off.

  `actions.purchase` stays and is true exactly when `purchasableUnits > 0`.
  *(Names are my call; follow ADR-0079 if they read wrong.)*
- **Only the counts change in the list and manage views.**
  `availableUnits` and `committedUnits` now count units.

## Docs

- **A new ADR: "A hold covers one or more units of a single gift; buying
  fewer releases the rest".** It records the alternatives the owner turned
  down: separate holds per unit, partial release, and topping up an
  existing hold.
- **ADR-0019 (quantity may drop below what's committed)** still holds, with
  committed now counted in units. Amend its wording in place if it says
  "holds" where it means units (ADRs are editable until release).
- **The ADR-0046 cap,** when built, counts holds. Note this in the new ADR,
  not in ADR-0046.

## Tests (at the owning layer)

- **Domain (`Item`, `Hold`):**
  - Placing a hold of N units reserves N.
  - More than the units free is refused.
  - Zero or a fraction is refused.
  - Buying fewer than held returns the rest to `availableUnits`.
  - The purchase limit on an active hold is the units held.
  - The limit on an expired hold is the smaller of the units held and the
    units free.
  - Buying more than the limit is refused.
  - The constructor rejects bought units above held units.
- **Application:** `toHoldView` maps `units`, `purchasedUnits` and
  `purchasableUnits`. This is mapping only, so it needs one test at most.
- **Repository contract and projection rebuild:** units and bought units
  round-trip, and a rebuild re-folds them from the events.
- **Routes:** `units` is required and must be an integer ≥ 1 on both
  requests; a domain refusal maps to 409 or 400 as in the table.
- **Web:**
  - The hold sheet shows the stepper only when more than one unit is free.
  - The stepper's bounds and the button wording follow the count.
  - The count locks once sent.
  - "Only N left now." appears after a 409.
  - The purchase sheet opens only for a hold of more than one unit.
  - The purchase sheet starts at the units held.
  - The release note appears when the count is lowered.
  - The card shows "× N".
- **e2e:** one flow — hold 2 of a quantity-5 item, mark 1 as purchased, and
  see "4 left" from another guest's view.

## Left to the builder

- Whether the stepper is one shared component used by both sheets (likely)
  and where it lives (`apps/web/src/lib/` fits next to `LimitedField`).
- Whether the purchase sheet is a new component or a mode of an existing
  one.
- How to split the work into PRs within the 10-file cap (domain + events +
  storage, then API contract, then web hold sheet, then web purchase sheet
  is a natural order).
- Backend shape beyond the rules above. The owner allowed modelling units as
  several holds internally, but this design uses one hold with a unit count,
  so "Your holds" shows one card per decision the guest made.
