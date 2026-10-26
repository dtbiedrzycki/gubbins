# Guest view Storybook theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the guest view (key screen, list, "Your holds", hold and chip-in dialogs) in the Storybook look, with no behaviour change apart from the "is promised." wording, the hold-length header line and the key-screen heading and hint.

**Architecture:** Palette, fonts and the stamp animation live as Tailwind v4 `@theme` tokens in `apps/web/src/index.css`, with three `@utility` classes for buttons and fields. Components swap their slate classes for those tokens. One small `Seal` component draws the wax seal for the list rows and the "Your holds" cards. Fonts come from Fontsource and are bundled by Vite.

**Tech Stack:** React 19, Tailwind v4 (`@tailwindcss/vite`), Vitest + Testing Library, Playwright, `@fontsource/im-fell-english`, `@fontsource/alegreya-sans`.

**Spec:** `docs/superpowers/specs/2026-10-25-guest-storybook-theme-design.md`

## Global Constraints

- Every PR changes at most 10 files (skill small-prs). Each task below is one PR, stacked in order, the first targeting `main`.
- Work only in the worktree `/tmp/claude-1000/-workspace/b26ca6c0-60d5-4e43-99a4-2024e848ece5/scratchpad/themes`, branch prefix `feat/storybook/`. Another session uses `/workspace`.
- Verify with the skill verifying-gubbins-locally before every push (`--e2e` for the PR that targets main, and at the stack tip).
- Button labels, "Held until …" and "<title> has been purchased." stay word for word. The only copy changes are the ones named in a task.
- Owner pages (`/manage`, create list) change only by picking up the body font. Don't give them the paper background.
- Contrast on paper `#F6F3FB` (checked): ink 13.1, muted `#625A78` 5.9, moss 6.6, error `#B42335` 5.9, white on moss 7.3. Gold `#D9A93A` and petal never carry text. Success text uses moss, not `green-700` (4.6, too close).
- Decorative drawings (door, vine, seal, jar) are `aria-hidden="true"`.
- No test names or comments mention the plan, spec, tasks or PR numbers (memory: no plan identifiers in tests).

## Review Focus

1. **A long item or list title on a 360px phone**, with a seal beside the status line, must wrap, never push the page sideways. The seal is `flex-none` and the text is `min-w-0`. Check it in the Task 5 screenshots.
2. **A hold length of 1** must read "for 1 day", not "1 days". A ListPage test in Task 1 covers it.
3. **An overfunded group gift** (pledged more than the price) fills the jar to 100%, never past it. An ItemView test in Task 2 covers it.
4. **Reduced motion** shows the seal with no animation. The stamp class is `motion-safe:animate-stamp`. A YourHolds test in Task 3 checks the class is applied only through `motion-safe:`.
5. **Holds already there when the page loads, or after a refetch,** don't stamp. Only a card whose hold id wasn't present before stamps. A YourHolds test in Task 3 covers it.

---

### Task 0: Design doc and plan (docs only)

**Files:** `docs/superpowers/specs/2026-10-25-guest-storybook-theme-design.md`, `docs/superpowers/plans/2026-10-25-guest-storybook-theme.md`, `docs/design/guest-themes.html` (the mockup). Branch `feat/storybook/00-docs` off `main`.

- [ ] **Step 1:** Commit the two docs and the mockup: `docs: Storybook guest theme design and plan`.

### Task 1: Fonts, tokens and the key screen

**Files** (7):
- Modify: `apps/web/package.json`, `package-lock.json` (add the two Fontsource deps, from `npm install -w @gubbins/web @fontsource/im-fell-english @fontsource/alegreya-sans`)
- Modify: `apps/web/src/main.tsx` (import `@fontsource/im-fell-english/latin-400.css`, `.../latin-400-italic.css`, `@fontsource/alegreya-sans/latin-400.css`, `.../latin-700.css`; check that these file names exist in `node_modules` and use the plain `400.css` names if not)
- Modify: `apps/web/index.html` (`<title>Gubbins</title>`)
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/features/guest-key/GuestKeyGate.tsx`, `apps/web/src/pages/ListPage.tsx`
- Test: `apps/web/src/pages/ListPage.test.tsx`

**Interfaces:**
- Produces these Tailwind tokens, used by every later task:
  - colours `paper #F6F3FB`, `ink #2E2447`, `muted #625A78`, `line #DCD3EA`, `moss #34603F`, `petal #F2CBD6`, `gold #D9A93A`, `wax #9E2A45`, `error #B42335`
  - `--font-display: "IM Fell English", Georgia, serif`, and `--font-sans: "Alegreya Sans", system-ui, sans-serif` (overrides Tailwind's default sans)
  - `--animate-stamp: stamp 0.45s cubic-bezier(.2,1.6,.4,1) both`, with `@keyframes stamp` running from `scale(1.9) rotate(12deg); opacity: 0` to `scale(1) rotate(-8deg); opacity: 1`
- Produces `@utility` classes:
  - `btn-primary`: min-h-11, px-5 py-2, moss fill, white bold text, radius `22px 22px 22px 6px`, `disabled:opacity-50`
  - `btn-secondary`: same shape, transparent fill, `inset 0 0 0 1.5px` ink outline, ink text
  - `field`: min-h-11, w-full, `1.5px` ink border, radius 14px, white background, px-3

- [ ] **Step 1: Write the failing tests** in `ListPage.test.tsx`, reusing the file's existing list fixture and render helper:
  - `it('tells guests how long a hold keeps a gift', …)`: with `holdDurationDays: 3`, expect `screen.getByText("When you hold an item, it's held for you for 3 days.")`.
  - `it('says "1 day" for a one-day hold', …)`: with `holdDurationDays: 1`, expect `"When you hold an item, it's held for you for 1 day."`.
  - In the existing key-gate test (the 401 path), also expect `screen.getByRole('heading', { name: 'Knock, knock.' })` and `screen.getByText('Enter the guest key from your invite.')`.
- [ ] **Step 2:** Run `npm test -w @gubbins/web -- --testTimeout=30000 src/pages/ListPage.test.tsx`. Expected: the new assertions FAIL.
- [ ] **Step 3:** Install the deps, add the font imports, the tokens and utilities in `index.css`, and the title.
- [ ] **Step 4:** Change `GuestKeyGate`:
  - Add an `<h1 className="font-display …">Knock, knock.</h1>` above the form, and the door drawing above that (a `div` 170×196px, radius `85px 85px 6px 6px`, moss planks as a `repeating-linear-gradient`, a gold knob and a round window as pseudo-elements or child spans, `aria-hidden`).
  - Then add `<p>Enter the guest key from your invite.</p>`.
  - The input uses `field`, the button uses `btn-primary w-full`, and the error uses `text-error`.
  - Keep the label "Enter the guest key", the generic error text and "Checking…"/"View list" unchanged.
- [ ] **Step 5:** Change `ListPage`:
  - Every `<main>` becomes `bg-paper text-ink`.
  - The loaded list's header is centred, with `<h1 className="font-display text-[2.05rem] leading-tight text-balance">`, then the hold-length line in `text-muted`, then a decorative vine (a `span`, `aria-hidden`: a 1.5px moss rule with a petal dot in the middle).
  - The "Try again" button uses `btn-primary`, and the error and refresh-warning colours become `text-error` and amber-800 (unchanged).
  - Item `<li>`s lose the card look (`rounded border bg-white`) and become rows with `border-b border-line py-5`.
- [ ] **Step 6:** Run the ListPage and GuestKeyGate tests. Expected: PASS. Then run the full verify (with `--e2e`, since this PR targets main). Expected: green.
- [ ] **Step 7:** Commit: `feat(web): Storybook fonts, colours and guest key screen`.

### Task 2: Seal, jar and "is promised" in the list

**Files** (6):
- Create: `apps/web/src/features/holds/Seal.tsx`
- Modify: `apps/web/src/features/holds/ItemView.tsx`, `apps/web/src/features/holds/ItemAnnouncement.tsx`
- Test: `apps/web/src/features/holds/ItemView.test.tsx`, `apps/web/src/pages/ListPage.test.tsx`, `e2e/guest-manages-a-hold.spec.ts`

**Interfaces:**
- Produces `export function Seal({ stamp = false }: { stamp?: boolean }): JSX.Element`:
  - It renders `<span aria-hidden="true" data-seal className="…">G</span>`: a 44px circle, flex-none, wax fill with a radial highlight, `rotate(-8deg)`, the "G" in `font-display`.
  - When `stamp` is true, it adds `motion-safe:animate-stamp`.

- [ ] **Step 1: Update the wording tests:**
  - `ItemView.test.tsx`: the `['held', 'Stroller is held.']` row and the `toHaveTextContent('Stroller is held.')` become `'Stroller is promised.'`.
  - `ListPage.test.tsx`: both `'Stroller is held.'` become `'Stroller is promised.'`.
  - `e2e/guest-manages-a-hold.spec.ts:39`: the same change.
- [ ] **Step 2: Add the failing tests** in `ItemView.test.tsx`:
  - `it('shows a seal beside a held or purchased item, and none on an available one', …)`: render each of the three statuses. Expect `container.querySelector('[data-seal]')` to be non-null for held and purchased, and null for available. Expect no `motion-safe:animate-stamp` in the seal's class for either.
  - `it('fills the jar no further than full when a gift is overfunded', …)`: for a group item with `priceMinor: 1000`, `pledgedMinor: 1500`, expect `container.querySelector('[data-jar-fill]')` to have `style.height === '100%'`.
- [ ] **Step 3:** Run `npm test -w @gubbins/web -- --testTimeout=30000 src/features/holds/ItemView.test.tsx src/pages/ListPage.test.tsx`. Expected: FAIL.
- [ ] **Step 4:** Implement `Seal`.
- [ ] **Step 5:** Change `ItemView`:
  - The held message becomes `` `${item.title} is promised.` ``.
  - The title is `<h2 className="font-display text-[1.3rem] leading-tight text-balance">`.
  - For held or purchased, wrap the `<Seal />` and `<ItemAnnouncement>` in `flex items-center gap-2.5`, with the announcement `min-w-0`. The announcement stays mounted for available items, so keep it outside any status conditional, as now.
  - For a group gift, show the jar (a `div` 46×58px with an ink border, a moss lid via `before:`, and a `data-jar-fill` child at `height: ${Math.min(pct, 100)}%` with gold coins) to the left of the pledged text and "Chip in". Keep the `<progress>`, restyled to `accent-moss h-2 w-full`.
  - Links become `text-moss underline`, and buttons use `btn-primary`.
- [ ] **Step 6:** Change `ItemAnnouncement` from `text-green-700` to `font-display italic text-ink`. The role and `aria-live` are unchanged.
- [ ] **Step 7:** Run the tests from Step 3. Expected: PASS. Run verify (tests level). Expected: green.
- [ ] **Step 8:** Commit: `feat(web): wax seals, wishing jar and "is promised" on the guest list`.

### Task 3: "Your holds" panel and the stamp

**Files** (3): Modify `apps/web/src/features/holds/YourHolds.tsx`, `apps/web/src/features/holds/HoldActions.tsx`. Test: `apps/web/src/features/holds/YourHolds.test.tsx`.

**Interfaces:** consumes `Seal` from Task 2.

- [ ] **Step 1: Write the failing tests** in `YourHolds.test.tsx`, using the existing `listViews` and `renderYourHolds` helpers:
  - `it('shows a still seal on holds that were there when the page loaded', …)`: with `list([active])`, the card has a `[data-seal]` without `animate-stamp` in its class.
  - `it('stamps the seal on a hold that appears while the page is open', …)`:
    - Start with `list([])`, then serve `list([active])` and invalidate the list query (`client.invalidateQueries`).
    - The new card's seal class contains `motion-safe:animate-stamp`. That class is how reduced motion is honoured, so assert the `motion-safe:` prefix exactly.
  - `it('shows no seal on an expired hold', …)`: with `list([expiredBuyable])`, there is no `[data-seal]` in the region.
- [ ] **Step 2:** Run `npm test -w @gubbins/web -- --testTimeout=30000 src/features/holds/YourHolds.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3:** Change `YourHolds`:
  - Record the hold ids present on first render in a `useState(() => new Set(holdIds))` initialiser (the `initialHoldIds` set never updates). A card stamps when its id isn't in that set.
  - Cards for status `active` and `purchased` get `<Seal stamp={!initialHoldIds.has(hold.holdId)} />` beside the `h3`, in `flex items-center gap-2.5`, with the title `min-w-0`.
  - The section becomes `rounded-[18px] border-[1.5px] border-line bg-white p-4`, with the heading `font-display text-2xl`.
  - The card borders go. Cards are separated by `border-t border-line pt-3`.
  - The success message changes from `text-green-700` to `text-moss`, and the error to `text-error`.
- [ ] **Step 4:** Change `HoldActions`: the `primary` and `secondary` constants become `'btn-primary'` and `'btn-secondary'`, and the release-question box `border-slate-300` becomes `border-line`.
- [ ] **Step 5:** Run the tests from Step 2 plus `ListPage.test.tsx`. Expected: PASS. Run verify (tests level). Expected: green.
- [ ] **Step 6:** Commit: `feat(web): Your holds panel with a stamped seal on new holds`.

### Task 4: Hold and chip-in dialogs

**Files** (2): Modify `apps/web/src/features/holds/HoldDialog.tsx` and `apps/web/src/features/contribute/ContributeDialog.tsx`. No test changes: copy and behaviour are untouched, and the existing tests are the check.

- [ ] **Step 1:** In both dialogs:
  - The `<dialog>` becomes `bg-paper text-ink rounded-[22px] p-6 backdrop:bg-ink/50`.
  - The title paragraph gets `font-display text-[1.3rem]`.
  - Inputs and textareas use `field` (`LimitedInput`/`LimitedTextarea` take the caller's `className`; don't edit `LimitedField`).
  - Primary buttons use `btn-primary`, cancel and copy buttons use `btn-secondary`, links use `text-moss underline`, and errors use `text-error`.
  - `text-slate-700` hints become `text-muted`.
- [ ] **Step 2:** Run `npm test -w @gubbins/web -- --testTimeout=30000 src/features/holds src/features/contribute`. Expected: PASS.
- [ ] **Step 3:** Commit: `feat(web): Storybook hold and chip-in dialogs`.

### Task 5: Phone check at the stack tip

- [ ] **Step 1:** Run verify with `--e2e` at the tip (Task 4's branch). Tell the peer session first, since e2e servers are shared.
- [ ] **Step 2:** Take Playwright screenshots at 360×780 of the key screen, the list (with held, purchased and group items, plus a long title), and both dialogs, using the e2e fixtures. Save them to the scratchpad and send them to the owner. Fix anything from Review Focus item 1 on the branch that owns the file, then merge up.
- [ ] **Step 3:** Open the PRs, each at most 10 files (`git diff --stat <base>...HEAD | tail -1`), with bodies from the skill writing-pr-descriptions.
