# Manage page redesign: gift rows — design

- **Date:** 2026-11-20
- **Status:** Approved by the owner (2026-11-20)
- **Mockup:** [`docs/design/manage-redesign-mockup.html`](../../design/manage-redesign-mockup.html)
  (row style A chosen; B kept for comparison)

## Why

The public demo will show the manage page to every visitor, so the owner's
side has to look finished. Today each gift row on the manage page shows a
title, a price line and six buttons (Up, Down, Top, Bottom, Edit, Delete).
The owner can't see a gift's description without opening its edit form, and
can't see who bought or pledged at all.

The owner wants three things from the row:

- **Descriptions**, shown the way guests see them.
- **Who gave what**, for thank-you notes, for matching Venmo and Zelle
  payments to pledges, and for the fun of watching when they don't mind
  spoilers. Hidden until the owner asks for it.
- **Fewer buttons per gift.**

This is Gate 1 item 3 of the open-source roadmap
(`2026-11-19-open-source-roadmap-design.md`).

## Owner rulings (2026-11-20)

- **One reveal for the whole list.** A single "Show who gave what" control
  reveals the details under every gift at once, not one gift at a time.
- **Row style A**: a drag handle and one "⋯" menu per gift. The menu holds
  Move to top, Move to bottom, Edit and Delete.

From the roadmap, already decided:

- Hidden hides only who and what they said. Counts and progress always show.
- Names and messages come from a separate owner-only request made on reveal,
  never in the manage view, so they don't reach the browser unrevealed.
- Not now: marking a gift "thanked" (ADR-0021), a list-wide pledge view, the
  spoiler settings in `docs/spec/owner-dashboard.md` (ADR-0020/0070, which stay
  accepted but unbuilt).

## Goals, non-goals, anti-goals

- **Goal:** the owner can write a thank-you note or match a payment from the
  manage page, without asking anyone.
- **Goal:** each gift row reads at a glance on a phone: what it is, what's
  still needed, and one place for its actions.
- **Non-goal:** drag-and-drop itself. It is roadmap item 4, and the handle and
  "⋯" menu ship with it. Until then the row keeps today's six buttons.
- **Non-goal:** the payment method on a pledge. Roadmap item 3a records it.
- **Anti-goal:** a guest's name or message reaching the browser before the
  owner presses "Show who gave what", including the network tab and the query
  cache.
- **Anti-goal:** hiding the counts. The owner still sees what's needed, and
  the edit warnings keep their numbers.

## Approaches considered

**Row style** (owner picked A):

- **A. Handle + "⋯" menu (chosen).** Two controls per row. Dragging handles
  most moves. The menu keeps a non-drag way to jump to the top or bottom, and
  the handle takes Space and the arrow keys for keyboard users. Edit and
  Delete take two taps instead of one.
- **B. "Arrange" mode.** Rows show Edit and Delete; an Arrange button swaps
  every row to a handle plus the four move buttons. Edit stays one tap, but
  reordering needs a mode, and the mode has to hide the details to fit.

**Where names come from** (decided in the roadmap):

- **A separate owner-only request on reveal (chosen).** Nothing personal
  loads until asked for.
- **In the manage view, hidden by the web app.** One request, but every name
  and message sits in the browser and the network tab on every visit, which
  the anti-goal rules out.

## The design

### Each gift row

Top to bottom, as in the mockup:

1. **Title**, with "group gift" after it for a group gift.
2. **Price line**, as today: "$34.00 · quantity 1", or "$180.00 target".
3. **Description**, rendered with the guest page's `Markdown` inside
   `ClampedText`: two lines, then "Show more". Not remembered across visits
   (no `rememberAs`), unlike the list description.
4. **Count line**, always shown:
   - single gift: "**1 of 3** bought · 1 held". "· N held" appears only when
     N > 0. "held" is the word guests see (ruling from the guest feedback round).
   - group gift: "**$100.00 of $180.00** pledged · 55%", with the guests' coin
     bar under it. Same wording and rounding (floor) as the guest card: the
     progress line and bar move out of `ItemView.tsx` into a shared
     component that both pages use.
5. **Actions.** Until roadmap item 4 lands: today's Edit, Delete and move
   buttons, unchanged. With item 4: the handle on the left and the "⋯" menu
   on the right. A Delete that the list refuses is shown disabled in the menu,
   with today's reason under it ("Guests have already picked this one, so it
   can't be deleted.").
6. **Details card**, only while revealed (below). Until item 4 it sits
   under the row's buttons; with item 4, under the gift text.

### The count needs a contract change

The manage view's `committedUnits` lumps active holds and purchases together.
The manage view gains **`purchasedUnits`** per item (the domain's
`Item.purchasedCount()`); held = `committedUnits − purchasedUnits`. One
contract change, in its own PR with its route (ADR-0077). Group gifts keep
using `pledgedMinor`.

### "Show who gave what"

- A box above the gift list: "**Who gave what is hidden.**", a
  "Show who gave what" button, and the warning "Spoilers: this shows every
  guest's name and message, for all gifts."
- Pressing it fetches the details and shows a card under every gift. The box
  then reads "**Showing who gave what.**" with a "Hide" button, and the
  warning goes. The status line is a polite live region, so screen readers
  hear the change; focus stays on the button.
- **Not remembered** (*builder's call, for the owner to check*). A reload, or
  leaving the page, hides the details again, so a guest at the owner's
  shoulder doesn't see them by accident. The alternative remembers it in
  that browser's `localStorage`. Hide drops the details from the query cache,
  so the next reveal fetches afresh.
- While loading, the button reads "Showing…" and is disabled. If the request
  fails, an error shows in the box (the shared `actionErrorMessage` copy) and
  the button stays; a 404 sends the owner back to the token gate, as other
  owner requests do.
- Shown details refresh when the manage view does (after an edit, move or
  delete), so they never disagree with the counts.

### The details card

Under each gift, while revealed. Grouped by kind, each row the guest's name,
its numbers and a date. Bought rows sort by when they were bought, held rows
by expiry (soonest first), pledges by when they were pledged:

- **Bought** (single gifts): name, "· N" units when more than 1 (the hold's
  `purchasedUnits`, not its `units`: a part-bought hold gave the rest back),
  the date it was bought (`purchasedAt`), and the guest's message under it in
  italics. An undone buy doesn't show.
- **Held** (single gifts, active holds only, the same set the count line's
  "held" counts): name, units when more than 1, "until Nov 27".
- **Pledged** (group gifts): name, amount, the pledge date, and the message if
  the guest left one. The payment-method line ("via Venmo to @handle",
  "method not recorded") arrives with roadmap item 3a; until then there is
  no method line.
- Nothing yet: "No one has held, bought or pledged yet."

Every row sorts oldest first. Released, expired and undone holds don't show.
Dates are the owner's local date, month and day ("Nov 12"), with the year
when it isn't the current one.

Every hold and pledge has a name: holds have stored one since before the
first release, and pledges always have. The hold's `piiRef` type is still
nullable, so the use case treats a missing one as an error rather than
showing it.

### The details request

- `GET /api/lists/:slug/gift-details`, owner only. Not the owner is the same
  as no list (404, ADR-0016), like the manage view.
- `Item` gains two queries, its active holds and its purchased holds, as of
  its load instant. `purchasedCount()` and `committedUnits()` are rewritten
  on top of them, so the details card and the count line can't disagree
  about what "held" and "bought" mean.
- A new use case loads the wishlist as of the request instant (`at`), takes
  each item's purchased and active holds and its contributions, and reads
  their names and messages from `guest_pii` in **one batch query**: the
  `GuestPiiRepository` port gains a `findByIds`, with the contract suite,
  the SQLite adapter and the in-memory fake.
- Response: per item id, three lists (`purchases`, `holds`, `pledges`) with
  name, units or amount in minor units, message (nullable) and the instant.
- The response is `Cache-Control: no-store`, as the guest-key suggestion
  already is, so no shared cache keeps a copy of guests' names.
- A new ADR records the on-demand reveal as what is built now, beside the
  unbuilt spoiler settings of ADR-0020/0070. It amends ADR-0022, which says
  messages reach the owner straight away: the owner can press "Show who
  gave what" at any time, so it isn't a spoiler gate.

## Build order

Docs first, then about seven 10-file PRs. File counts are checked when the
plan is written; a PR that would pass 10 files is split.

1. **Docs:** this design and the mockup.
2. **ADR:** the on-demand reveal, amending ADR-0022.
3. **`Item` active and purchased holds:** the two domain queries, with the
   counts rewritten on them.
4. **Manage view `purchasedUnits`:** use case, shared types, route, contract.
5. **Web, gift row text:** the shared progress component, then the
   description and count line on the manage page.
6. **Gift-details use case, with `GuestPiiRepository.findByIds`:** port,
   contract suite, SQLite, fake, use case. Its caller is the next PR.
7. **Gift-details route and contract.**
8. **Web, reveal and details card:** API client, query key, the box, the
   card.
9. **E2E:** one journey: a guest buys with a message, the owner reveals and
   sees the name and message, then hides them.

The handle and "⋯" menu are built with roadmap item 4. The method line on
pledges is built with item 3a.

## Left to the builder

- Component structure, file names, and where the reveal state lives.
- The response field names, within the shape above.
- How to name the use case (ADR-0079).
- Test placement, by the owning-layer rule in `AGENTS.md`.
