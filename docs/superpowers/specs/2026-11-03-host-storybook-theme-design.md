# Host screens: Storybook theme

## Intent

The guest view has had the Storybook look since 2026-10-26: lilac paper,
IM Fell English headings, moss pill buttons. The host's screens (creating
a list, the "Your list is ready" screen, the owner token screen and the
manage page) still use plain Tailwind greys, slate buttons and all-caps
labels. Hosts see two different-looking apps. This work brings the host
screens into the same look so Gubbins reads as one product.

The one new idea is the **invitation card**. Guests knock at a round
green door; the host is the one handing out the way in. So the guest key
and guest link sit together on a card hung from a brass eyelet, with
buttons to copy each. Everything around it stays quiet.

Reference mockup: [`docs/design/host-view-mockup.html`](../../design/host-view-mockup.html).
It shows every screen below with this design's palette, type and wording.
It loads fonts from Google Fonts for convenience; the app keeps its
self-hosted Fontsource fonts.

## Goals

- Restyle the four host screens: create a wishlist, your list is ready,
  owner token, and manage (including the add, edit-item and
  edit-details forms and the delete confirmation).
- Add the invitation card, used on both "Your list is ready" and the
  manage page.
- Add three copy buttons: "Copy key" and "Copy link" on the card, and
  "Copy token" beside the owner token.

## Non-goals

- Any server or API change. The host screens use only data they already
  receive.
- Showing the host what guests have held or pledged. The manage view
  returns `committedUnits` and `pledgedMinor`, but the page still doesn't
  show them, so the surprise isn't spoiled. (*My call*, from the approved
  mockup.)
- A dark ("night") version. The host screens stay light in both phone
  themes, like the guest view. The mockup's dark mode is only for viewing
  the mockup. (*My call*, keeping the guest view's deferral.)
- The guest door or wax seals on host screens. The door belongs to guests.
- Changing the home and privacy pages.

## Anti-goals

- Jokes in button labels, hints or errors. The whimsy is in the card's
  drawing and the type, as on the guest side.
- Any loss of accessibility: labels, live regions, focus handling after
  edit, cancel, delete and gate success all stay as they are, and every
  control keeps a 44px touch target.
- Breaking the e2e flows. The `guest-link`, `guest-key` and `owner-token`
  test ids, the "Manage your list" link (new tab), the "Owner token" label
  and the "Add item" and "Manage list" buttons keep their names.

## Constraints

- PRs of at most 10 changed files each (skill `small-prs`).
- Only the font weights already loaded: IM Fell English 400 (regular and
  italic) and Alegreya Sans 400 and 700. `font-medium` and `font-semibold`
  go away from host screens. That settles the deferred "owner-page
  weights" note from the guest theme work.
- No new dependency.
- Verify each PR with the `verifying-gubbins-locally` skill (`--e2e` when
  targeting main).

## Decided design

### Tokens and shared pieces

Reuse the palette, fonts and utilities already in `apps/web/src/index.css`:
`paper`, `ink`, `muted`, `line`, `moss`, `petal`, `gold`, `wax`, `error`,
`font-display`, `font-sans`, `btn-primary`, `btn-secondary` and `field`.
New:

- **Brass** `#8C6A4A` (the door's frame colour, already used as a literal
  in `.door`) becomes a token for the card's eyelet and string.
- **Danger button:** `btn-secondary`'s shape with a wax outline and wax
  text, for Delete.
- **Small button size:** the pill buttons inside rows (Edit, Delete,
  Copy key, Copy link, Copy token, Regenerate) use slightly less horizontal
  padding, still 44px tall.
- **Section headings:** IM Fell English, regular, about 1.35rem, sentence
  case. They replace the 0.8rem uppercase tracked labels.
- **Field labels:** Alegreya Sans 700, sentence case, above the field.
  Hints are 400 in `muted`.
- **Errors:** the existing `error` red, in a `role="alert"` paragraph, as
  today.

### The invitation card

A white card with a 1.5px ink border, square-ish top corners and rounder
bottom corners, rotated about 1.2° anticlockwise, with a solid petal
offset shadow. A brass eyelet (a paper-coloured circle with a brass ring)
sits at the top centre, with a short brass string rising from it. All
decoration is CSS and `aria-hidden`.

Inside, centred:

1. "Guests open the list with" in IM Fell English italic, `muted`.
2. The guest key, Alegreya Sans 700, about 1.75rem, wrapping anywhere.
3. "Copy key", a small outline pill, centred under the key.
4. A dashed `line` divider, then the guest link (moss, wrapping
   anywhere) on the left and "Copy link" on the right.

On the ready screen the link stays the `<a data-testid="guest-link">`
it is today; on the manage page it stays plain text, as today. The key
keeps `data-testid="guest-key"` on the ready screen.

Under `prefers-reduced-motion` nothing changes, because the card does
not move. The rotation is static.

### Copy buttons

- On press, copy with `navigator.clipboard.writeText` inside the click
  handler.
- On success the button turns primary (moss fill) and reads "Key copied",
  "Link copied" or "Token copied" for two seconds, then goes back. The label change is
  announced through a polite live region.
- If the clipboard isn't available or refuses (for example a home server
  reached over plain `http://`, where browsers withhold the clipboard),
  select the key, link or token text instead so the host can copy it by hand,
  and leave the label unchanged.

### Screens

**Create a wishlist.** The page heading "Create a wishlist" in IM Fell
English. The form keeps every field, label, hint, order and behaviour,
restyled with `field`, the new labels and hints, and `btn-primary` for
"Create list". The "Guest key" section shows the suggested key large
(Alegreya Sans 700) on the left, with "Regenerate" (its restart icon kept)
as a small outline pill on the right.

**Your list is ready.** Replaces the form in place. The page heading
becomes "Your list is ready" (the current paragraph "Your list is ready."
goes; the "Create a wishlist" heading isn't shown on this screen). Then:

1. The invitation card, with "Copy key" and "Copy link".
2. The owner token box: a white box with a wax border. The heading
   "Your owner token" is in IM Fell English in wax. Below it is the text
   "Keep this private. You need it to manage the list, and it isn't shown
   again.", then the token in a monospace face, wrapping anywhere, with
   `data-testid="owner-token"`, and "Copy token". The wording replaces
   today's "Owner token — keep this private" label and the "Save your
   owner token now…" paragraph.
3. The "Manage your list" link in moss, 700, still opening a new tab with
   its "(opens in a new tab)" screen-reader text.

**Owner token screen.** The heading "Manage your list", the "Owner token"
password field, the alert paragraph (wrong token: "That isn't the owner
token for this list."; expired: "Enter your owner token again."), and
"Manage list" as `btn-primary`, full width. No door.

**Manage.** Top to bottom, as in the mockup:

1. "Manage your list" heading (focused after the gate, as today).
2. List details: the list title is the section heading (IM Fell English),
   with a small "Edit" pill to its right; the description below it in
   `muted`, rendered with `Markdown` as today. Editing opens the existing
   form in place, restyled.
3. "Invite your guests" heading, then the invitation card. This replaces
   the separate "Guest key" and "Guest link" sections.
4. "Add an item" heading, then the existing add form in a white box with a
   `line` border and 14px radius. "Add item" is full-width `btn-primary`.
   The "Kind of item" choice keeps its fieldset and legend.
5. "Items" heading, then rows divided by `line` rules (top and bottom), not
   cards. Each row shows the title (700), a muted "group gift" tag where it
   applies, the existing meta line, then "Edit" and "Delete" pills. A
   blocked Delete is disabled with its existing hint beside it.
   The delete confirmation and the edit form open in place in the row,
   restyled with the same buttons. In the edit form, "Save" (and "Save
   anyway", "Save new target") is primary, and "Cancel" and "Go back" are
   outline. In the delete confirmation ("Delete “<title>”? This can’t be
   undone."), the confirming "Delete" keeps its wax fill in the pill shape,
   and "Keep it" is outline. The row's own Delete is the wax-outline
   danger pill.

The query error alert stays above the details, as today.

*My call:* while the list details form is open, the section heading keeps
showing the saved title (the Edit pill hides, as today). The heading
"List details" goes away, so tests that look for it change on purpose.

### Where the mockup is only a sketch

The mockup simplifies a few things; the app's current behaviour wins:
errors use the `error` red (not wax), the blocked-Delete hint keeps
today's wording, and the item meta line keeps today's format.

## Left to the builder

- Class names. The card and copy button are shared by `create-list` and
  `manage`, so they live as shared UI primitives in `src/lib/` (beside
  `LimitedField`), which the feature-boundary lint rule allows.
- The exact CSS of the card, eyelet and string, within the mockup's look.
- How the ready screen swaps its heading (move the heading into the form
  component or lift the success state), as long as focus and
  announcements behave at least as well as today.
- Which existing unit tests change because their markup moved, and the
  copy-button tests (one component test for success, revert after two
  seconds, and the select-text fallback is enough).
- How the work splits into PRs. Expected: shared tokens, buttons and the
  card with copy first; then each screen.
