# Guest view: Storybook theme (first pass)

## Intent

Guests open the wishlist on their phones. Today it is plain Tailwind
slate. The owner wants the guest view to have a look of its own that plays
on the name "gubbins" in a whimsical way, while staying clean and easy to
use. They chose the "Storybook" direction from three mockups: a
picture-book page with a round green door, wax seals and a wishing jar.

This first pass ships for launch (guests arrive about 2026-10-27). It has
to land in a few hours of work without changing behaviour.

Reference mockup: https://claude.ai/artifact/8CZ3giFNVAVgABSH53wf74
("Storybook" tab). The mockup's hobgoblin copy, "Once upon a list" line
and footer are **not** part of the design (owner ruling, below).

## Goals

- Restyle the guest screens: the guest key screen, the list, "Your holds",
  and the hold and chip-in dialogs.
- Serve the two typefaces from Gubbins itself. No request leaves for a
  third party (owner ruling: privacy).
- Change one piece of wording: a held item's status line reads
  "<title> is promised." instead of "<title> is held."

## Non-goals (deferred)

- A dark ("night") version. The guest view stays light in both phone
  themes for now.
- The owner (`/manage`) and create-list pages. They must look the same as
  they do today, apart from picking up the new body font.
- Motion beyond the one seal stamp described below.
- Any other copy change. Buttons keep their labels ("View list",
  "Hold this item", "Chip in", "Mark as purchased", "Extend hold",
  "Release hold"). Purchased items keep "<title> has been purchased."
  "Your holds" keeps "Held until …".

## Anti-goals

- Jokes in button labels or error messages. Whimsy lives in drawings,
  type and the one status word.
- Fairy-tale narration: no hobgoblin, no "Once upon a list", no
  storybook footer (owner ruling).
- Any loss of accessibility: live regions, focus handling, the
  `progressbar` role and the 44px touch targets all stay.

## Constraints

- PRs of at most 10 changed files each.
- No behaviour changes. Existing unit and e2e tests pass unchanged,
  except where they assert the "is held." wording.
- No new runtime dependency apart from the two Fontsource font packages.
- Verify each PR with the `verifying-gubbins-locally` skill (`--e2e` when
  targeting main).

## Decided design

### Palette

| Token  | Hex       | Use                                          |
|--------|-----------|----------------------------------------------|
| paper  | `#F6F3FB` | page background (lilac paper)                |
| ink    | `#2E2447` | text, outline buttons                        |
| muted  | `#625A78` | secondary text                               |
| line   | `#DCD3EA` | dividers, card borders                       |
| moss   | `#34603F` | primary buttons, links, the door             |
| petal  | `#F2CBD6` | small accents (the divider's flower)         |
| gold   | `#D9A93A` | jar coins, door knob; never text             |
| wax    | `#9E2A45` | the wax seal                                 |

Errors keep a red that passes contrast on paper; success messages use
moss.

### Type

- **IM Fell English** (regular, italic) for headings: the list title, item
  titles, "Your holds", the gate heading, dialog titles.
- **Alegreya Sans** (400, 700) for everything else, including prices,
  buttons, fields and status lines.
- Both are OFL-licensed and self-hosted with `@fontsource/im-fell-english`
  and `@fontsource/alegreya-sans`, imported once in `main.tsx`. Latin
  subsets only.
- Fallbacks: Georgia, serif for headings; system-ui, sans-serif for body.

### Screens

**Guest key screen.** The heading is "Knock, knock." over a round green
door drawn in CSS (moss planks, brass knob, round window), marked
`aria-hidden`. Below it: "Enter the guest key from your invite.", then
the existing label, field, error and "View list" button.

**List.** The header shows the list title in IM Fell English, centred,
with the line "When you hold an item, it's held for you for N days." (N comes
from `holdDurationDays`, as now; "1 day" when N is 1), then a small vine divider (a thin moss
rule with a petal flower; decorative). Items are rows divided by `line`
rules, not cards. Each row keeps its current content and order.

- **Held item** (status `held`, meaning every unit is taken; *builder's
  call:* a guest holding one of several units sees no seal, since the
  item is still available and their hold shows under "Your holds"): a wax seal (round, wax red, "G" monogram, slightly
  rotated, `aria-hidden`) beside the status line "<title> is promised.".
- **Purchased item:** the same static wax seal beside the status line
  "<title> has been purchased." (owner ruling).
- **Group gift:** a small wishing jar (CSS drawing, gold coins filling to
  the pledged percentage, `aria-hidden`) beside the pledged text and
  "Chip in". The existing `<progress>` element stays, restyled, so screen
  readers and tests keep it.

**Your holds.** A white panel with a `line` border, below the list. Each
card for an active or purchased hold shows the wax seal beside its title;
expired and released cards show none (*builder's call*). The wording is
unchanged.

**Buttons.** Primary: moss fill, white text, a leaf-shaped radius
(rounded on three corners, tighter on the fourth). Secondary: transparent
with an ink outline.

**Dialogs (hold, chip in).** Paper background, an IM Fell English title,
rounded fields with an ink border, the same buttons. *Builder's call:*
`LimitedField` is not touched. Its amber warning already passes contrast
on paper, and it is shared with the owner forms, which must not change.

### Motion

Only one thing animates (owner ruling): the seal on a **new card in
"Your holds"** stamps in when that card appears while the page is open.
It starts large and faint, then settles in about 0.45 s. Focus already
moves to "Your holds" when a hold lands, so the guest sees it.

- Seals in the list (held and purchased items) never animate.
- Cards already there on first load or a reload never animate.
- Under `prefers-reduced-motion: reduce` the seal just appears.

## Left to the builder

- How the tokens are expressed in Tailwind v4 (`@theme` in `index.css` is
  expected), and class names.
- The exact CSS of the door, seal, jar and vine, within the mockup's look.
- How YourHolds tells a newly appeared card from one present at first
  render (it already tracks known hold ids), as long as it adds no new
  requests.
- The small error-red value, as long as it passes WCAG AA on paper.
- *Builder's call:* the loading and "Try again" screens get the paper
  background and body font, nothing more.
- Changing the page `<title>` from "gubbins" to "Gubbins".
