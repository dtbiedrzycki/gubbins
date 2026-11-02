# How group gifts work: guest explainer card — design

Mockup: [`docs/design/group-gift-explainer-mockup.html`](../../design/group-gift-explainer-mockup.html)
(guest list page at phone width, both cards).

## Why

Guests don't know where their money goes when they chip in to a group gift,
or who buys the gift. The list page already explains holding with a
dismissible "How holding a gift works" card
(`apps/web/src/features/holds/HowHoldingWorks.tsx`). Group gifts get a
matching card that says the money goes straight from the guest to the host
by Venmo or Zelle, and the host buys the gift.

## Goals

1. A "How group gifts work" card on the guest list page, matching the
   holding card in look and behaviour.
2. It says, in plain words, that guests pay the host directly with Venmo or
   Zelle, that the site shows them how when they chip in, and that the host
   buys the gift.

## Non-goals

- No change to the chip-in dialog, pledging, or the payment links it shows.
- No API, domain or schema change. The list view already carries everything
  the card needs.
- No owner-side copy.

## Anti-goals

- Copy that raises new questions. The owner removed "The money never passes
  through this site." for this reason: keep it to who you pay, how, and who
  buys.

## The card

Heading: **How group gifts work**

Steps (numbered list, same markup as the holding card):

1. **Chip in any amount.** Guests pool money toward one bigger gift.
2. **Send it straight to the host.** When you chip in, we’ll show you how to
   pay the host with Venmo or Zelle.
3. **The host buys the gift.** They use what everyone sent to buy it.

Owner rulings (2026-11-02):

- The wording above, including step 2's "we’ll show you how", which tells
  guests the site gives them the host's payment details.
- Step 2 always says "Venmo or Zelle", even when the host set up only one.
  The chip-in dialog shows whichever the host set up.

## Behaviour

- **Same look and dismissal as the holding card:** white card, display-face
  heading, × Dismiss button (44px target, `aria-label="Dismiss"`), section
  labelled by its heading. Shows on every visit until the guest dismisses it
  on this device; remembered in `localStorage` under its own key
  (`gubbins.groupGiftExplainerDismissed`), so dismissing one card does not
  dismiss the other. Blocked storage behaves as the holding card does:
  shows, and a dismiss lasts only for that visit.
- **Placement:** directly below the holding card, above the status line and
  gift filter. *(My call.)*
- **When it shows:** when the list has at least one group gift that is not
  yet fully funded, i.e. `type === 'group'` and `filterKey(item) ===
  'available'` (`apps/web/src/features/holds/ItemFilter.tsx`). A list with no
  group gifts, or only fully funded ones, has nothing to chip in to, so the
  card stays out, the same reasoning as `canHold` in `ListPage.tsx`.
  *(My call.)*
- **Focus on dismiss:** focus moves to the gift filter, as the holding card
  does. When both cards show, dismissing the holding card moves focus to
  the group card's Dismiss button instead, so keyboard users don't skip the
  card they haven't read. Both buttons are labelled "Dismiss", so reach the
  group card's button through its section or a ref, not by label alone.
  *(My call.)*

## Tests (at the owning layer)

- Component test for the new card: shows until dismissed and stays
  dismissed; blocked storage dismisses for the visit only. Mirrors
  `HowHoldingWorks.test.tsx`.
- `ListPage.test.tsx`: the card shows with the three steps for a list with
  an unfunded group gift; is left out for a list with only single gifts and
  for one whose group gifts are all funded; focus on dismiss as above.
- No e2e change.

## Left to the builder

- Whether to extract a shared dismissible-card shell from `HowHoldingWorks`
  or keep two small components. Either is fine; keep the shipped holding
  card's markup and tests unchanged in behaviour.
- File location (`features/contribute/` fits).
