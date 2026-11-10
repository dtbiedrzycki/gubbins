# Your contributions, Wanted counts and store names — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests reach their holds and chip-ins from a floating "Your contributions" button, see what the owner still wants as "Wanted: N more", see which store a link goes to, and see their own holds and chip-ins on each gift's card.

**Architecture:** One new read field (`myContributions`) on the guest list view, derived from contributions the aggregate already loads. Everything else is web: two copy changes, one shared `<dialog>` hook, two card lines, and the section moving into a sheet behind a floating button.

**Tech Stack:** TypeScript, Fastify + zod (`@gubbins/shared-types`), React 19, TanStack Query, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-guest-contributions-design.md`

## Global Constraints

- **Start only after the purchase-message stack (#211–#217) has merged to main.** It rewrites `PurchaseDialog`, `HoldActions` and the hold cards. Every task bases on main as it stands then; where this plan names a line, re-find it there.
- At most 10 changed files per PR, generated files included (skill small-prs). One linear stack, Tasks 1, 2, 3, 4a, 4b, 5, 6: each task one PR (7 PRs).
- Verify each branch with `~/.claude/skills/verifying-gubbins-locally/verify.sh` (add `--e2e` when the PR targets main) on a clean tree. A branch is green only when it prints `verify: all ... checks passed`.
- Exact copy: "Wanted: N more", "of N wanted", "Only N still wanted now.", "View on {host}", "Your contributions", "Your contributions · N", "You're holding N", "You chipped in $X.XX." (sheet entry), "You chipped in $X.XX" (card line), "Close".
- No plan identifiers in test names or comments; ADR citations are fine (skill reviewing-for-recurring-feedback).
- Each test is at the layer that decides its rule (skill testing-at-the-owning-layer). The protected line is named beside each test below.
- Worktrees under `/workspace/.worktrees/`; announce e2e runs; at most 3 verify runs in parallel.

## Review Focus

1. **A store URL with a port, an IP, or upper-case host** (`https://WWW.Example.com:8443/x`): expect "View on example.com" (hostname drops the port; URL lowercases). Test in Task 2.
2. **Two pledges to the same group gift** by one guest: card sums them; sheet lists both. Tests in Task 5 (card) and Task 6 (sheet).
3. **A hold made in another tab** appears after refetch: the button stamps when it first appears while the page is open, not on load and not for later entries. Test in Task 6.
4. **Releasing the guest's only hold from the sheet**: the sheet closes, the button goes, "released" is still announced, and focus moves to the list title. Test in Task 6.
5. **Purchase sheet opened from inside the contributions sheet** (nested modal `<dialog>`s): Escape closes only the top one. jsdom has no `showModal`, so e2e owns it: a step in Task 6's journey.

---

### Task 1: "Wanted" wording

**Files:**
- Modify: `apps/web/src/features/holds/ItemView.tsx` (the `{availableUnits} left` line)
- Modify: `apps/web/src/features/holds/HoldDialog.tsx` ("of N left", "Only N left now.")
- Modify: `apps/web/src/lib/Stepper.tsx` (the `describedBy` doc comment only)
- Test: `apps/web/src/features/holds/ItemView.test.tsx`, `apps/web/src/features/holds/HoldDialog.test.tsx`
- Modify: `e2e/guest-holds-several.spec.ts`, `e2e/owner-adds-items.spec.ts` (text locators)

**Interfaces:** none.

- [ ] **Step 1:** Rename and update the existing tests (they protect the three strings):
  - ItemView: `'shows how many more are wanted only when more than one is available'` expects `Wanted: 5 more`. The `it.each` `'hides the units left when %s'` becomes `'hides how many are wanted when %s'` and queries `/^Wanted:/` (its old `/left$/` query would match nothing after the change and pass vacuously). The same query swap applies to `'gives a group gift its price and no Hold button or units'`.
  - HoldDialog: the 409 test becomes `'after a 409 with 1 still wanted, says "Only 1 still wanted now." and lets the guest confirm again'`; its `'of 2 left'` assertion becomes `'of 2 wanted'`.
- [ ] **Step 2:** Run `npx vitest run --testTimeout=30000 src/features/holds` in `apps/web`. Expect FAIL on the new strings.
- [ ] **Step 3:** Change the three strings to the exact copy; update the Stepper comment ("such as how many are still wanted").
- [ ] **Step 4:** Re-run. Expect PASS. Update the e2e text locators (`'3 left'` → `'Wanted: 3 more'`, etc.) and rename the `guest-holds-several` test title to `'a guest holds 2 of 5, buys 1, and another guest sees "Wanted: 4 more"'`.
- [ ] **Step 5:** Verify, commit `feat(web): say how many more the owner wants, not how many are left`.

### Task 2: Store link names its site

**Files:**
- Create: `apps/web/src/lib/storeHost.ts`, Test: `apps/web/src/lib/storeHost.test.ts`
- Modify: `apps/web/src/features/holds/ItemView.tsx`, Test: `apps/web/src/features/holds/ItemView.test.tsx`
- Modify: `e2e/owner-adds-items.spec.ts` (link name)

**Interfaces:**
- Produces: `storeHost(url: string): string` — hostname with one leading `www.` removed. No fallback: `Item`'s constructor refuses any URL that isn't parseable https, so every stored URL parses.

- [ ] **Step 1:** Tests in `storeHost.test.ts` (protect the `www.` strip and the use of `hostname`):
  - `'names the site without www'`: `storeHost('https://www.vendor.com/item/1')` → `'vendor.com'`
  - `'keeps other subdomains'`: `'https://shop.example.co.uk/x'` → `'shop.example.co.uk'`
  - `'drops the port and lower-cases the host'`: `'https://WWW.Example.com:8443/x'` → `'example.com'`
- [ ] **Step 2:** Run; expect FAIL (module missing).
- [ ] **Step 3:** Implement with `new URL(url).hostname` and `/^www\./`.
- [ ] **Step 4:** ItemView: link text `View on {host}`; the sr-only text is unchanged. Rename `'links to the store in a new tab, naming the item'` to `'links to the store in a new tab, naming the site and the item'`, expecting the accessible name `View on example.com for {title} (opens in a new tab)` (protects ItemView's use of `storeHost`).
- [ ] **Step 5:** Run; expect PASS. Update e2e's `'View in store'` locator to the seeded URL's host.
- [ ] **Step 6:** Verify, commit `feat(web): name the store each link goes to`.

### Task 3: One shared modal `<dialog>` hook

**Files:**
- Create: `apps/web/src/lib/useModalDialog.ts`, Test: `apps/web/src/lib/useModalDialog.test.tsx`
- Modify: `apps/web/src/features/holds/HoldDialog.tsx`, `apps/web/src/features/holds/PurchaseDialog.tsx`, `apps/web/src/features/contribute/ContributeDialog.tsx`
- Modify (delete moved tests): `HoldDialog.test.tsx`, `PurchaseDialog.test.tsx`, `ContributeDialog.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function useModalDialog(options: { isPending: boolean; onClose: () => void }): {
    ref: RefObject<HTMLDialogElement | null>;
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => void; // preventDefault while pending
    onClose: () => void; // reopen while pending, else options.onClose()
  };
  ```
  It calls `showModal()` on mount (jsdom fallback `dialog.open = true`, with the existing comment). The three dialogs spread these onto their `<dialog>`; HoldDialog and ContributeDialog wrap `onCancel` to write gifter names first.

- [ ] **Step 1:** Tests in `useModalDialog.test.tsx`, on a tiny test component (protect the hook's three branches):
  - `'opens the dialog when mounted'` (jsdom can't tell modal from open)
  - `'refuses Escape while the request is in flight'`
  - `'reopens rather than closes if the browser closes it anyway while in flight'`
  - `'calls onClose when closed with nothing in flight'`
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the hook; move the existing why-comments (Escape fires `cancel` first; Chrome's second Escape) into it.
- [ ] **Step 4:** Switch the three dialogs to the hook. Delete the per-dialog copies of these tests (`'cannot be cancelled or escaped while the … is in flight'`, `'reopens rather than closes …'`, `'can be escaped when nothing is in flight'`). Keep `'remembers the names when the dialog is escaped'` (the dialogs own that) and ContributeDialog's two-taps test (it asserts one request, which the dialog owns); drop only its "cannot be escaped meanwhile" half if that makes the name and assertions match.
- [ ] **Step 5:** Check before deleting (skill testing-at-the-owning-layer): break the hook's `preventDefault` and its reopen; confirm a surviving test fails for each.
- [ ] **Step 6:** If the purchase sheet's silent close when a refetch removes its action falls out of the hook naturally, fix it here with a test in `PurchaseDialog.test.tsx`; otherwise leave it parked and say so in the PR body.
- [ ] **Step 7:** Verify, commit `refactor(web): one hook opens, guards and reopens every modal sheet`.

### Task 4a: The list view use case returns the guest's chip-ins

**Files (4):**
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, Test: `apps/api/src/domain/entities/Wishlist.test.ts`
- Modify: `apps/api/src/application/use-cases/GetListView.ts`, Test: `apps/api/src/application/use-cases/GetListView.test.ts`

The route's zod serializer sends the parsed (stripped) output, so the new field doesn't reach the response, and no route or web file changes until Task 4b.

**Interfaces:**
- Produces (domain): `Wishlist.contributionsForSession(sessionHash: string): Contribution[]`, across all items, using `Contribution.belongsToSession`.
- Produces (use case): `ListView.myContributions: { contributionId: string; itemId: string; amountMinor: number; pledgedAt: string }[]`, newest `pledgedAt` first, `[]` without a guest session.

- [ ] **Step 1:** Tests:
  - Wishlist: `'contributionsForSession returns only that session's pledges, across items'` (protects the filter).
  - GetListView: `'lists pledges newest first, each with only its id, item, amount and pledge time'`, asserting with `toEqual` on the mapped objects so any extra field (`sessionHash`, `idempotencyKey`, `piiRef`) fails it (protects the sort and the mapping; the session filter is the Wishlist test's). Rename `'shows the list, its available item, no holds, and the hold duration guests will get'` → `'shows the list, its available item, no holds or pledges, and the hold duration guests will get'`, adding `myContributions: []` to its whole-view match. Extend `'shows no holds to a caller without a session'` → `'shows no holds or pledges to a caller without a session'` (protects the `access.guestSession` branch).
- [ ] **Step 2:** Run `npx vitest run src/domain/entities/Wishlist.test.ts src/application/use-cases/GetListView.test.ts` in `apps/api`; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Verify, commit `feat(api): the list view use case returns the guest's own pledges`.

### Task 4b: The list view response carries the guest's chip-ins

**Files (9):**
- Modify: `packages/shared-types/src/listView.ts`, Test: `packages/shared-types/src/holdView.test.ts` (add `myContributions` to its full-object fixture and to the `'requires myHolds and capabilities'` row, renamed `'requires myHolds, myContributions and capabilities'`)
- Generated: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (`npm run gen:api`)
- Test: `apps/api/src/presentation/routes.integration.test.ts` (the list-view `toEqual` gains `myContributions: []`)
- Fixtures that build a list view: `apps/web/src/api/client.test.ts`, `apps/web/src/pages/ListPage.test.tsx`, `apps/web/src/features/holds/useHoldItem.test.tsx`, `apps/web/src/features/holds/YourHolds.test.tsx`

**Interfaces:**
- Produces (API, required field): `contributionViewSchema = z.object({ contributionId: z.string(), itemId: z.string(), amountMinor: z.number().int().positive(), pledgedAt: z.string() })` and `myContributions: z.array(contributionViewSchema)` on `listViewResponseSchema`, with a doc comment that names, messages and payment details are deliberately left out.

- [ ] **Step 1:** Update `holdView.test.ts` and the route test as listed; run; expect FAIL.
- [ ] **Step 2:** Add the schema; run `npm run gen:api`; add `myContributions: []` to the web fixtures.
- [ ] **Step 3:** Run; expect PASS.
- [ ] **Step 4:** Verify, commit `feat(api): the list view response carries the guest's own pledges`.

### Task 5: The gift cards show the guest's own holds and chip-ins

**Files:**
- Modify: `apps/web/src/features/holds/ItemView.tsx`, Test: `apps/web/src/features/holds/ItemView.test.tsx`
- Modify: `apps/web/src/pages/ListPage.tsx`, Test: `apps/web/src/pages/ListPage.test.tsx`

**Interfaces:**
- Consumes: `myHolds` (existing), `myContributions` (Task 4b).
- Produces: `ItemView` props `heldUnits: number` (units in this guest's `active` holds on the item) and `chippedInMinor: number` (sum of this guest's pledges to it), computed in `ListPage`. The `focusElsewhere` prop is removed; ItemView focuses its own `<h2>` (`tabIndex={-1}`) on both paths that used it.

- [ ] **Step 1:** Tests:
  - ItemView: `'says "You're holding 2" when the guest holds 2'` and `'shows no holding line when the guest holds none'` (protect the line's condition).
  - ItemView: `'says "You chipped in $40.00" on a group gift the guest pledged to'`, `'shows no chip-in line when the guest pledged nothing'`, and `'still says "You chipped in $40.00" once the gift is fully funded'` (protect the chip-in line's condition and placement outside the Chip in branch).
  - ListPage: rewrite `'keeps a gift held from the Available filter on screen and moves focus to "Your holds"'` → `'after holding from the Available filter, keeps the gift on screen and moves focus to its heading'`, and `'moves focus to Your holds when the guest cancels after losing the item to someone else'` → `'after losing the item to someone else and cancelling, moves focus to the gift's heading'` (protect ItemView's focus target, through the page). Remove the focus assertion from `'holds the item, then shows it held and under "Your holds" with its actions'`, which the first rewrite now owns.
  - ListPage: `'counts only active holds: 2 active and 1 expired read "You're holding 2"'` and `'sums two pledges of $40.00 and $15.00 to "You chipped in $55.00"'` (protect the two derivations in ListPage).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. The holding line sits with the units line; the chip-in line sits with the pledged total, above Chip in, and stays when fully funded.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Verify, commit `feat(web): each gift card shows what this guest holds or chipped in`.

### Task 6: "Your contributions" button and sheet

**Files:**
- Rename + rewrite: `apps/web/src/features/holds/YourHolds.tsx` → `YourContributions.tsx`; test `YourHolds.test.tsx` → `YourContributions.test.tsx` (`git mv`, so review shows the diff)
- Modify: `apps/web/src/pages/ListPage.tsx`, Test: `apps/web/src/pages/ListPage.test.tsx`
- Modify: `apps/web/src/features/holds/Seal.tsx` (a `'coin'` tone, moss green, for chip-in entries as in the mockup)
- Modify (comments naming "Your holds"): `apps/web/src/features/holds/ItemView.tsx`, `apps/web/src/features/holds/useHoldItem.ts`
- Modify: `e2e/guest-manages-a-hold.spec.ts`, `e2e/guest-holds-several.spec.ts`

**Interfaces:**
- Consumes: `useModalDialog` (Task 3), `myContributions` (Task 4b), `formatMoney`, `Seal`.
- Produces: `YourContributions({ slug, holds, contributions, itemTitles, onEmptied })`, rendering the floating button and, when opened, the sheet. `onEmptied: () => void` is called when an action removes the last entry; `ListPage` wires it to focus its `<h1>` (by ref, `tabIndex={-1}`). It renders nothing visible when there are no entries, but keeps a page-level `role="status"` and `role="alert"` pair mounted (ADR-0025) for outcomes that empty the sheet; outcomes that leave entries show in the sheet's own pair.

- [ ] **Step 1:** Tests in `YourContributions.test.tsx`. Existing hold-card tests carry over, renamed only where they mention "Your holds"; `'says where holds will appear when there are none'` is deleted with the empty state. Rewrites of existing tests:
  - `'after a release, moves focus to the Your holds heading'` → `'after a release with other entries left, moves focus to the sheet's heading'`
  - `'after a refusal, moves focus to the Your holds heading'` → `'after a refusal, moves focus to the sheet's heading, beside the explanation'`
  - the two `'closes the purchase sheet … and shows why beside "Your holds"'` tests and `'still explains a refusal when the refetch shows the hold was already released elsewhere'` keep their setups with "beside the sheet's heading"; add `'when a refusal removes the last entry, closes the sheet and still explains it'` (protects the page-level alert region).
  New tests:
  - `'shows no button when the guest has neither holds nor pledges'`
  - `'labels the button with the number of entries'`: 1 hold + 2 pledges → `Your contributions · 3`
  - `'lists holds, then pledges newest first'`, with a pledge entry reading `You chipped in $40.00.`
  - `'returns focus to the button when the sheet closes'`
  - `'when the last hold is released, closes the sheet, announces it and calls onEmptied'`
  - `'stamps the button when it first appears, not on load and not for a later entry'`
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. The button is `fixed` at bottom centre. While it shows, `ListPage`'s `<main>` gets bottom padding at least its height plus gap (a test in `ListPage.test.tsx`: `'pads the end of the page only while the contributions button shows'`; the real no-overlap check is in the e2e step below). The sheet is a `<dialog>` via `useModalDialog`, titled "Your contributions", with Close. `ListPage`'s `<h1>` gets `tabIndex={-1}` and is focused from `onEmptied`. ListPage tests: add `'when the guest releases their last hold, moves focus to the list title'`; rewrite those that find the "Your holds" region: `'shows the list title and a heading for each item'` (drop the region check), `'holds the item, then shows it held and under "Your holds" with its actions'` → `'holds the item, then lists it in Your contributions with its actions'`, and `'keeps the list, with the new hold under "Your holds", when the refetch after a hold fails'` → `'keeps the list, with the new hold in Your contributions, when the refetch after a hold fails'`. Outcome live regions sit inside the sheet; a page-level `role="status"` region carries the outcome when an action empties the sheet. Delete the "Holds you place appear here." empty state.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** e2e: replace the `'Your holds'` heading/region locators with: click `Your contributions · N`, then act in the dialog named "Your contributions". `guest-holds-several` keeps its journey (hold 2, buy 1 from the sheet, another guest sees `Wanted: 4 more`) and adds one step: open Mark as purchased from the sheet, press Escape, expect the purchase sheet closed and the "Your contributions" dialog still open; then close it, scroll to the bottom, and expect the button's bounding box not to overlap the last gift's. Announce the e2e run.
- [ ] **Step 6:** Verify with `--e2e`, commit `feat(web): Your contributions opens from a floating button`.

### Docs (with the design PR, not the stack)

ADR-0050 is amended in place on the design branch: its same-session hint is the card's "You chipped in $X" line plus the sheet entry. The spec, mockup, plan and ADR go in one docs PR targeting main.
