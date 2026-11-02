# Group-gift explainer card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dismissible "How group gifts work" card to the guest list page.

**Architecture:** A new React component beside `HowHoldingWorks`, with the same markup and the same dismiss-and-remember pattern under its own storage key. `ListPage` renders it below the holding card when the list has an unfunded group gift.

**Tech Stack:** React, Tailwind, Vitest + Testing Library + MSW.

**Spec:** `docs/superpowers/specs/2026-11-02-group-gift-explainer-design.md`

## Global Constraints

- Card copy, verbatim (curly apostrophe in "we’ll"):
  - Heading: `How group gifts work`
  - 1. `Chip in any amount.` / `Guests pool money toward one bigger gift.`
  - 2. `Send it straight to the host.` / `When you chip in, we’ll show you how to pay the host with Venmo or Zelle.`
  - 3. `The host buys the gift.` / `They use what everyone sent to buy it.`
- Storage key: `gubbins.groupGiftExplainerDismissed`, value `'yes'`.
- Step 2 always says "Venmo or Zelle", whatever the host set up.
- No API, domain or schema change. No e2e change.
- Test names and comments carry no plan or spec references.

## Review Focus

1. Both cards showing: two buttons named "Dismiss". Tests must scope by region, and dismissing the holding card must put focus on the group card's Dismiss (Task 2 test).
2. A list whose only group gift is fully funded: card stays out (Task 2 test).
3. Blocked storage: card shows, and dismiss lasts for the visit only (Task 1 test).
4. Dismissing one card must not dismiss the other (Task 1 test: the holding key is untouched).
5. The existing holding-card tests keep passing unchanged.

## PRs

- **PR A (docs, 3 files):** spec, mockup, this plan. Branch `docs/group-gift-explainer-spec`.
- **PR B (feature, 4 files):** Tasks 1–2. Branch `feat/group-gift-explainer` off `main`.

---

### Task 1: `HowGroupGiftsWork` component

**Files:**
- Create: `apps/web/src/features/contribute/HowGroupGiftsWork.tsx`
- Test: `apps/web/src/features/contribute/HowGroupGiftsWork.test.tsx`

**Interfaces:**
- Produces: `export function HowGroupGiftsWork({ onDismiss }: { onDismiss?: () => void }): JSX.Element | null`. Renders `<section aria-labelledby="how-group-gifts-title">`; its Dismiss button is `aria-label="Dismiss"`.

- [ ] **Step 1: Write the failing tests**, modelled on `HowHoldingWorks.test.tsx`, with `card = () => screen.queryByRole('region', { name: 'How group gifts work' })`:
  - `shows on every visit until the guest dismisses it, then stays hidden` (render, unmount, render, click Dismiss, gone, unmount, render: still gone).
  - `dismisses for this visit only where storage is blocked` (getItem/setItem throw).
  - `leaves the holding explainer's dismissal alone`: after dismiss, `localStorage.getItem('gubbins.holdingExplainerDismissed')` is `null`.
  - `says guests pay the host and the host buys the gift`: the three bold step texts are present, and the card has text `When you chip in, we’ll show you how to pay the host with Venmo or Zelle.`

- [ ] **Step 2: Run, expect FAIL** (module not found)
  `npm -w apps/web exec -- vitest run src/features/contribute/HowGroupGiftsWork.test.tsx --testTimeout=30000`

- [ ] **Step 3: Implement** by copying `HowHoldingWorks.tsx`'s structure and classes: `DISMISSED_KEY`, the try/catch `wasDismissed`/`rememberDismissed`, heading id `how-group-gifts-title`, the three `<li>` items from Global Constraints. No props besides `onDismiss`.

- [ ] **Step 4: Run, expect PASS** (same command).

- [ ] **Step 5: Commit** `feat(web): explain how group gifts work`

### Task 2: Show the card on the list page

**Files:**
- Modify: `apps/web/src/pages/ListPage.tsx` (near `canHold`, line ~65, and the `HowHoldingWorks` block)
- Test: `apps/web/src/pages/ListPage.test.tsx`

**Interfaces:**
- Consumes: `HowGroupGiftsWork` (Task 1); `filterKey` from `../features/holds/ItemFilter`.

- [ ] **Step 1: Write the failing tests** in `ListPage.test.tsx`. Fixture: `const groupGift = aListItem({ id: 'item-g', title: 'Honeymoon fund', type: 'group', availableUnits: 0, priceMinor: 50000, pledgedMinor: 0 })`.
  - `explains group gifts when the list has one still taking pledges`: list `{ ...view(false), items: [groupGift] }`; region `How group gifts work` contains `Send it straight to the host.`
  - `it.each` `leaves out the group-gift explainer when the list has %s`: `only single gifts` → `view(false)`; `only fully funded group gifts` → items `[{ ...groupGift, pledgedMinor: 50000 }]`. Assert after the h1 loads that `queryByText('How group gifts work')` is null.
  - `shows the group-gift explainer below the holding explainer`: list with `view(false).items` plus `groupGift`; the holding region precedes the group region (`compareDocumentPosition` & `DOCUMENT_POSITION_FOLLOWING`).
  - `moves focus to the group-gift explainer when the guest dismisses the holding explainer while both show`: click Dismiss within the holding region; Dismiss within the group region has focus.
  - `moves focus to the gift filter when the guest dismisses the group-gift explainer`: list `[groupGift]`; click its Dismiss; `button` `All · 1` has focus.

- [ ] **Step 2: Run, expect FAIL**
  `npm -w apps/web exec -- vitest run src/pages/ListPage.test.tsx --testTimeout=30000`

- [ ] **Step 3: Implement** in `ListPage.tsx`:
  - `const canChipIn = items.some((item) => item.type === 'group' && filterKey(item) === 'available');` with a one-line why comment like `canHold`'s.
  - Render `{canChipIn && <HowGroupGiftsWork onDismiss={focusFilter} />}` directly after the holding card.
  - Holding card's `onDismiss`: focus the group card's Dismiss (`document.querySelector('[aria-labelledby="how-group-gifts-title"] button')`) when present, else the gift filter as today. Extract the existing filter-focus selector into one local `focusFilter` used by both.

- [ ] **Step 4: Run, expect PASS** (same command), then the whole web suite: `npm -w apps/web exec -- vitest run --testTimeout=30000`.

- [ ] **Step 5: Verify locally** with skill verifying-gubbins-locally. The PR targets main, so run it with `--e2e`; another session shares this container, so check memory use first and keep to its run caps.

- [ ] **Step 6: Commit** `feat(web): show the group-gift explainer on the list page`
