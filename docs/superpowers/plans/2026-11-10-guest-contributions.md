# Your contributions, Wanted counts and store names — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests reach their holds and chip-ins from a floating "Your contributions" button, see what the owner still wants as "Wanted: N more", see which store a link goes to, and see their own holds and chip-ins on each gift's card.

**Architecture:** One new read field (`myContributions`) on the guest list view, derived from contributions the aggregate already loads. Everything else is web: two copy changes, one shared `<dialog>` hook, two card lines, and the section moving into a sheet behind a floating button.

**Tech Stack:** TypeScript, Fastify + zod (`@gubbins/shared-types`), React 19, TanStack Query, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-guest-contributions-design.md`

## Global Constraints

- **Start only after the purchase-message stack (#211–#217) has merged to main.** It rewrites `PurchaseDialog`, `HoldActions` and the hold cards. Every task bases on main as it stands then; where this plan names a line, re-find it there.
- At most 10 changed files per PR, generated files included (skill small-prs). One linear stack, Tasks 1→6, each task one PR.
- Verify each branch with `~/.claude/skills/verifying-gubbins-locally/verify.sh` (add `--e2e` when the PR targets main) on a clean tree. A branch is green only when it prints `verify: all ... checks passed`.
- Exact copy: "Wanted: N more", "of N wanted", "Only N still wanted now.", "View on {host}", fallback "View in store", "Your contributions", "Your contributions · N", "You're holding N", "You chipped in $X.XX." (sheet entry), "You chipped in $X.XX" (card line), "Close".
- No plan identifiers in test names or comments; ADR citations are fine (skill reviewing-for-recurring-feedback).
- Each test is at the layer that decides its rule (skill testing-at-the-owning-layer). The protected line is named beside each test below.
- Worktrees under `/workspace/.worktrees/`; announce e2e runs; at most 3 verify runs in parallel.

## Review Focus

1. **A store URL with a port, an IP, or upper-case host** (`https://WWW.Example.com:8443/x`): expect "View on example.com" (hostname drops the port; URL lowercases). Test in Task 2.
2. **Two pledges to the same group gift** by one guest: card sums them; sheet lists both. Tests in Task 5 (card) and Task 6 (sheet).
3. **A hold made in another tab** appears after refetch: the button appears with its stamp only for entries new since the page opened, not on load. Test in Task 6.
4. **Releasing the guest's only hold from the sheet**: the sheet closes, the button goes, and "released" is still announced. Test in Task 6.
5. **Purchase sheet opened from inside the contributions sheet** (nested modal `<dialog>`s): Escape closes only the top one. Covered by the e2e journey in Task 6.

---

### Task 1: "Wanted" wording

**Files:**
- Modify: `apps/web/src/features/holds/ItemView.tsx` (the `{availableUnits} left` line)
- Modify: `apps/web/src/features/holds/HoldDialog.tsx` ("of N left", "Only N left now.")
- Modify: `apps/web/src/lib/Stepper.tsx` (the `describedBy` doc comment only)
- Test: `apps/web/src/features/holds/ItemView.test.tsx`, `apps/web/src/features/holds/HoldDialog.test.tsx` (if it asserts "left")
- Modify: `e2e/guest-holds-several.spec.ts`, `e2e/owner-adds-items.spec.ts` (text locators)

**Interfaces:** none.

- [ ] **Step 1:** Rename and update the existing tests. ItemView: `'shows how many more are wanted only when more than one is available'` expects `Wanted: 5 more` (protects the ItemView count line). The 409 test becomes `'after a 409 with 1 still wanted, says "Only 1 still wanted now." and lets the guest confirm again'`. Any HoldDialog assertion on `of N left` becomes `of N wanted`.
- [ ] **Step 2:** Run `npx vitest run --testTimeout=30000 src/features/holds` in `apps/web`. Expect FAIL on the new strings.
- [ ] **Step 3:** Change the three strings to the exact copy; update the Stepper comment ("such as how many are still wanted").
- [ ] **Step 4:** Re-run. Expect PASS. Update the e2e text locators (`'3 left'` → `'Wanted: 3 more'`, etc.).
- [ ] **Step 5:** Verify, commit `feat(web): say how many more the owner wants, not how many are left`.

### Task 2: Store link names its site

**Files:**
- Create: `apps/web/src/lib/storeHost.ts`, Test: `apps/web/src/lib/storeHost.test.ts`
- Modify: `apps/web/src/features/holds/ItemView.tsx`, Test: `apps/web/src/features/holds/ItemView.test.tsx`
- Modify: `e2e/owner-adds-items.spec.ts` (link name)

**Interfaces:**
- Produces: `storeHost(url: string): string | null` — hostname with one leading `www.` removed; `null` if `new URL` throws.

- [ ] **Step 1:** Tests in `storeHost.test.ts` (protect the `www.` strip and the catch):
  - `'names the site without www'`: `storeHost('https://www.vendor.com/item/1')` → `'vendor.com'`
  - `'keeps other subdomains'`: `'https://shop.example.co.uk/x'` → `'shop.example.co.uk'`
  - `'drops the port and lower-cases the host'`: `'https://WWW.Example.com:8443/x'` → `'example.com'`
  - `'is null for a url it cannot read'`: `'not a url'` → `null`
- [ ] **Step 2:** Run; expect FAIL (module missing).
- [ ] **Step 3:** Implement with `new URL(url).hostname` and `/^www\./`.
- [ ] **Step 4:** ItemView: link text `View on {host}`, or `View in store` when `storeHost` is null; the sr-only text is unchanged. Update `'links to the store in a new tab, naming the item'` to expect the accessible name `View on example.com for {title} (opens in a new tab)` (protects ItemView's use of `storeHost`; the fallback is pinned in `storeHost.test.ts`, not again here).
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
  - `'opens as a modal when mounted'`
  - `'refuses Escape while the request is in flight'`
  - `'reopens rather than closes if the browser closes it anyway while in flight'`
  - `'calls onClose when closed with nothing in flight'`
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the hook; move the existing why-comments (Escape fires `cancel` first; Chrome's second Escape) into it.
- [ ] **Step 4:** Switch the three dialogs to the hook. Delete the per-dialog copies of these tests (`'cannot be cancelled or escaped while the … is in flight'`, `'reopens rather than closes …'`, `'can be escaped when nothing is in flight'`). Keep `'remembers the names when the dialog is escaped'` (the dialogs own that) and ContributeDialog's two-taps test (it asserts one request, which the dialog owns); drop only its "cannot be escaped meanwhile" half if that makes the name and assertions match.
- [ ] **Step 5:** Check before deleting (skill testing-at-the-owning-layer): break the hook's `preventDefault` and its reopen; confirm a surviving test fails for each.
- [ ] **Step 6:** If the purchase sheet's silent close when a refetch removes its action falls out of the hook naturally, fix it here with a test in `PurchaseDialog.test.tsx`; otherwise leave it parked and say so in the PR body.
- [ ] **Step 7:** Verify, commit `refactor(web): one hook opens, guards and reopens every modal sheet`.

### Task 4: The list view returns the guest's chip-ins

**Files (10):**
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, Test: `apps/api/src/domain/entities/Wishlist.test.ts`
- Modify: `apps/api/src/application/use-cases/GetListView.ts`, Test: `apps/api/src/application/use-cases/GetListView.test.ts`
- Modify: `packages/shared-types/src/listView.ts`
- Generated: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (`npm run gen:api`)
- Modify fixtures that build a list view: `apps/web/src/api/client.test.ts`, `apps/web/src/pages/ListPage.test.tsx`, `apps/web/src/features/holds/useHoldItem.test.tsx`

If the generated files plus fixtures push this over 10, split the domain method plus its test into its own PR first.

**Interfaces:**
- Produces (domain): `Wishlist.contributionsForSession(sessionHash: string): Contribution[]`, across all items, using `Contribution.belongsToSession`.
- Produces (API, required field): `ListView.myContributions: { contributionId: string; itemId: string; amountMinor: number; pledgedAt: string }[]`, newest `pledgedAt` first, `[]` without a guest session. Shared schema `contributionViewSchema = z.object({ contributionId: z.string(), itemId: z.string(), amountMinor: z.number().int().positive(), pledgedAt: z.string() })`, with a doc comment that names, messages and payment details are deliberately left out.

- [ ] **Step 1:** Tests:
  - Wishlist: `'contributionsForSession returns only that session's pledges, across items'` (protects the filter).
  - GetListView: `'lists the caller's own pledges, newest first, with no name or message'` (protects the sort and the mapping) and extend `'shows no holds to a caller without a session'` → `'shows no holds or pledges to a caller without a session'` (protects the `access.guestSession` branch).
- [ ] **Step 2:** Run `npx vitest run src/domain/entities/Wishlist.test.ts src/application/use-cases/GetListView.test.ts` in `apps/api`; expect FAIL.
- [ ] **Step 3:** Implement; add the schema field; run `npm run gen:api`; add `myContributions: []` to the web fixtures.
- [ ] **Step 4:** Run; expect PASS. No route test is added: the existing list-view route test validates the response against the schema.
- [ ] **Step 5:** Verify, commit `feat(api): the guest list view returns the guest's own pledges`.

### Task 5: The gift cards show the guest's own holds and chip-ins

**Files:**
- Modify: `apps/web/src/features/holds/ItemView.tsx`, Test: `apps/web/src/features/holds/ItemView.test.tsx`
- Modify: `apps/web/src/pages/ListPage.tsx`, Test: `apps/web/src/pages/ListPage.test.tsx`

**Interfaces:**
- Consumes: `myHolds` (existing), `myContributions` (Task 4).
- Produces: `ItemView` props `heldUnits: number` (units in this guest's `active` holds on the item) and `chippedInMinor: number` (sum of this guest's pledges to it), computed in `ListPage`. The `focusElsewhere` prop is removed.

- [ ] **Step 1:** Tests:
  - ItemView: `'says "You're holding 2" when the guest holds 2'` and `'shows no holding line when the guest holds none'` (protect the line's condition).
  - ItemView: `'says "You chipped in $55.00" on a group gift the guest pledged to'` (protects the card line).
  - ItemView: `'after holding, focus stays in the card'` replaces the old focus-elsewhere expectation (protects the post-hold focus).
  - ListPage: `'counts only active holds and sums two pledges to one gift'`, with an active hold of 2 + an expired hold of 1 on one item → "You're holding 2", and pledges of $40.00 + $15.00 → "You chipped in $55.00" (protects the derivation in ListPage).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. The holding line sits with the units line; the chip-in line sits with the pledged total, above Chip in, and stays when fully funded. After a hold, focus goes to the holding line (`tabIndex={-1}`).
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Verify, commit `feat(web): each gift card shows what this guest holds or chipped in`.

### Task 6: "Your contributions" button and sheet

**Files:**
- Rename + rewrite: `apps/web/src/features/holds/YourHolds.tsx` → `YourContributions.tsx`; test `YourHolds.test.tsx` → `YourContributions.test.tsx` (`git mv`, so review shows the diff)
- Modify: `apps/web/src/pages/ListPage.tsx`, Test: `apps/web/src/pages/ListPage.test.tsx`
- Modify: `e2e/guest-manages-a-hold.spec.ts`, `e2e/guest-holds-several.spec.ts`

**Interfaces:**
- Consumes: `useModalDialog` (Task 3), `myContributions` (Task 4), `formatMoney`, `Seal`.
- Produces: `YourContributions({ slug, holds, contributions, itemTitles })`, rendering the floating button and, when opened, the sheet. It renders nothing visible when there are no entries, but keeps its page-level live region mounted (ADR-0025).

- [ ] **Step 1:** Tests in `YourContributions.test.tsx` (existing hold-card tests carry over, renamed only where they mention "Your holds"):
  - `'shows no button when the guest has neither holds nor pledges'`
  - `'labels the button with the number of entries'`: 1 hold + 2 pledges → `Your contributions · 3`
  - `'lists holds, then pledges newest first'`, with a pledge entry reading `You chipped in $40.00.`
  - `'returns focus to the button when the sheet closes'`
  - `'closes the sheet and still announces it when the last hold is released'`
  - `'stamps the button only when an entry appears after the page opened'`
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement. The button is `fixed` at bottom centre. While it shows, `ListPage`'s `<main>` gets bottom padding at least its height plus gap (a test in `ListPage.test.tsx`: `'leaves room for the contributions button after the last gift'`, asserting the padding class is present only when entries exist). The sheet is a `<dialog>` via `useModalDialog`, titled "Your contributions", with Close. Outcome live regions sit inside the sheet; a page-level `role="status"` region carries the outcome when an action empties the sheet. Delete the "Holds you place appear here." empty state.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** e2e: replace the `'Your holds'` heading/region locators with: click `Your contributions · N`, then act in the dialog named "Your contributions". `guest-holds-several` keeps its journey (hold 2, buy 1 from the sheet, another guest sees `Wanted: 4 more`). Announce the e2e run.
- [ ] **Step 6:** Verify with `--e2e`, commit `feat(web): Your contributions opens from a floating button`.

### Docs (with the design PR, not the stack)

ADR-0050 is amended in place on the design branch: its same-session hint is the card's "You chipped in $X" line plus the sheet entry. The spec, mockup, plan and ADR go in one docs PR targeting main.
