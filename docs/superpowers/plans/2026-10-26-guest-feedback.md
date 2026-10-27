# Guest Feedback Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gubbins usable by a guest who has never heard of it: explained holds, a readable key, a footer, filters, descriptions, a Venmo/Zelle switch, a home and privacy page, an image-only CSP header, resource-style routes, and a public repo with `main` protected.

**Architecture:** Each task is one PR of at most 10 files. API changes follow the existing layers (domain → persistence → use case → route + OpenAPI → generated client); web changes stay in `apps/web/src/features/*`, `pages/` and `lib/`. Independent tasks branch from `main`; tasks that share files stack on the task named in their **Base** line.

**Tech Stack:** TypeScript, Fastify 5 + zod + Kysely/SQLite, React 19 + React Router 7 + TanStack Query + Tailwind 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-guest-feedback-design.md`. **Mockups:** `docs/design/guest-feedback-mockups.html` (open after `npm ci`). Every task's copy and layout come from these two files; quote copy verbatim from the spec.

## Global Constraints

- Every PR ≤ 10 changed files, generated files included (skill `small-prs`); ≤ 8 open PRs at once.
- Verify with `~/.claude/skills/verifying-gubbins-locally/verify.sh` (add `--e2e` if the PR targets main) on a clean tree; a branch is green only when it prints `verify: all ... checks passed`.
- Work in a worktree under your scratchpad, never in `/workspace` (peer sessions share it). Announce e2e runs to peers.
- One test per rule, at the layer that decides it (skill `testing-at-the-owning-layer`). No plan identifiers in test names or comments; ADR citations are fine in code, never in user-visible text.
- Follow skill `reviewing-for-recurring-feedback`; the owner rulings for this round are in the spec.
- Lengths are owned by the domain, enforced in entity private constructors; request schemas don't limit text; no DB length CHECKs. Migrations are edited in place (pre-release).
- Copy rules: "held" stays "held"; no jokes in labels or status text; seals only on held (wax) and purchased/funded (gold). Promise no tracking of people and no ads; never write "no analytics" or "no metrics".
- No request from a guest's browser to a third party (no CDN, no remote images).
- WCAG 2.2 AA: 44 px targets, real `<button>`s, `aria-pressed`/`aria-expanded` where the mockup toggles.
- After any route schema change: regenerate `apps/api/openapi.json` and `apps/web/src/api/schema.gen.ts` with the repo's existing scripts (see `apps/api/scripts/emit-openapi.ts` and `packages/api-typegen`); both count toward the 10 files.
- PR bodies follow skill `writing-pr-descriptions`.

## Review Focus

1. A guest whose browser restarts mid-hold must still see the hold under "Your holds" on the same browser → Task 1 asserts the cookie's `Max-Age`.
2. Markdown from an owner containing `javascript:` links, raw `<script>`/`<img>` HTML or `![](http://…)` images must render inertly, with no element that fetches → Task 16 tests each.
3. A remembered payment method the list doesn't offer (Zelle remembered, list has only Venmo), or a browser that blocks `localStorage`, must still show a usable method → Task 9 tests both.
4. A description short enough to fit in two lines shows no "Show more" button → Task 16 tests the clamp's no-overflow branch.
5. Old invite links `/{slug}` and `/{slug}/manage` (with or without `#…`) land on the new routes → Task 10 tests both redirects, fragment kept.

---

## Set 1 (day 1): must-haves, then two quick wins

Tasks 1–6 (including 5b), 8 and 9 are the 9 PRs of this set, never more than 8 open at once (5b opens when 5 merges); Task 7 is ops. Set 2 opens as set 1 merges.

### Task 1: Guest session cookie lasts 30 days

**Base:** main. **Files:**
- Modify: `apps/api/src/presentation/accessContext.ts` (next to `SIGNED_COOKIE_OPTIONS`)
- Modify: `apps/api/src/presentation/routes.ts:113` (guest session `setCookie`)
- Test: `apps/api/src/presentation/routes.integration.test.ts`

**Interfaces:** Produces `GUEST_SESSION_COOKIE_OPTIONS` = `{ ...SIGNED_COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 }` (seconds), with a one-line why (outlasts a hold plus its extension). The owner cookie keeps `SIGNED_COOKIE_OPTIONS`.

- [ ] **Step 1:** In the existing test "sets a session cookie for the correct key", assert the `set-cookie` header contains `Max-Age=2592000`; add to "sets a signed owner cookie for the correct token" that its header has no `Max-Age`.
- [ ] **Step 2:** Run `npx vitest run apps/api/src/presentation/routes.integration.test.ts` → FAIL on `Max-Age`.
- [ ] **Step 3:** Add the constant; use it for the guest session cookie only.
- [ ] **Step 4:** Rerun → PASS. Verify (`--e2e`). Commit `feat(api): keep a guest's session for 30 days`.

### Task 2: Holding explained

**Base:** main. **Files:**
- Create: `apps/web/src/features/holds/HowHoldingWorks.tsx`
- Modify: `apps/web/src/pages/ListPage.tsx` (render it between the header and the list)
- Modify: `apps/web/src/features/holds/HoldDialog.tsx`
- Test: `apps/web/src/features/holds/HoldDialog.test.tsx`, `apps/web/src/features/holds/ItemView.test.tsx`, `apps/web/src/pages/ListPage.test.tsx`, `e2e/guest-manages-a-hold.spec.ts` (7 files)

**Interfaces:** Produces `HowHoldingWorks({ holdDurationDays }: { holdDurationDays: number })` — a `<details open>` with summary "How holding a gift works" and the spec's three steps, day/days pluralised like the header. Step 2 always says the hold can be extended once (ADR-0002); there is no policy flag. The box replaces the list header's one-line "When you hold an item, it's held for you for N days." sentence; remove it and update the tests and e2e that read it.

- [ ] **Step 1:** ListPage test `explains holding: hold before buying, buy within 3 days, then mark it purchased or the hold ends` — asserts the summary text and the three bold step leads, with "3 days". HoldDialog test `tells the guest to come back and mark it purchased, or the hold ends after 3 days` — asserts the boxed note and subtitle "Other guests will see it's taken while you buy it.".
- [ ] **Step 2:** Run both files → FAIL.
- [ ] **Step 3:** Implement per spec goal 1 and the mockup. The existing "Held for you for N days." subtitle is replaced; update the two existing duration tests in `HoldDialog.test.tsx` to the new copy rather than adding repeats.
- [ ] **Step 4:** Rerun → PASS; verify (`--e2e`); commit `feat(web): explain holding and marking purchased`.

### Task 3: Key screen says where you are

**Base:** main. **Files (6):** Modify `apps/web/src/features/guest-key/GuestKeyGate.tsx`; Test `apps/web/src/features/guest-key/GuestKeyGate.test.tsx`, `apps/web/src/pages/ListPage.test.tsx`, and the e2e specs that select the field by label: `e2e/guest-manages-a-hold.spec.ts`, `e2e/guest-pledges.spec.ts`, `e2e/owner-adds-items.spec.ts`.

- [ ] **Step 1:** Extend "greets the guest at the door and says where the key is" to assert the two new paragraphs (spec goal 2, verbatim), the hint "The list owner sent it with your invite: three words joined by dashes." linked via `aria-describedby`, placeholder `maple-lantern-otter`, and `autocapitalize="none"`, `autocorrect="off"`, `spellcheck="false"`, `autocomplete="off"` on the input. Label becomes "Guest key".
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS; verify (`--e2e`; e2e selects the field by label — the label change breaks the three e2e specs above and `ListPage.test.tsx`); commit `feat(web): tell guests where they are and where the key comes from`.

### Task 4: Three-word guest key, at most 32 characters

**Base:** main. **Files:**
- Create: `apps/api/src/infrastructure/effLargeWordlist.ts`
- Modify: `apps/api/src/infrastructure/TokenGeneratorCrypto.ts`, `apps/api/src/domain/value-objects/GuestKey.ts`
- Test: `apps/api/src/infrastructure/crypto-adapters.test.ts`, create `apps/api/src/domain/value-objects/GuestKey.test.ts`, `apps/api/src/application/use-cases/EnterGuestKey.test.ts` (6 files)

**Interfaces:**
- `effLargeWordlist.ts` exports `EFF_LARGE_WORDLIST: readonly string[]` — the verbatim EFF large wordlist (7,776 words, one per line in a template string, split once). Source: download `https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt`, drop the dice-number column, and check the words-only text hashes to sha256 `6d557f0693958fb5e650b68b5bee585eb82cf4da32965505c789e924743bc522`. Header comment: source `https://www.eff.org/dice`, "© Electronic Frontier Foundation, CC BY 3.0 US", the sha256. The file stays verbatim (the filter below is code), so the attribution needs no "modified" note.
- `TokenGeneratorCrypto.generateGuestKey()` returns three words joined by `-`, each `GUEST_KEY_WORDS[randomInt(GUEST_KEY_WORDS.length)]`, where the exported `GUEST_KEY_WORDS = EFF_LARGE_WORDLIST.filter((w) => /^[a-z]+$/.test(w))` (drops `drop-down`, `felt-tip`, `t-shirt`, `yo-yo`; 7,772 words, ~38.8 bits). Update the bearer-secret doc comment: the guest key is no longer 24 random bytes.
- `GuestKey.MAX_LENGTH = 32` (why: old random keys are exactly 32 base64url characters; three words are at most 29). `GuestKey.from` throws `DomainValidationError('Guest key must be at most 32 characters')` above it.

- [ ] **Step 1:** Tests: `GuestKey.test.ts` — `limits a guest key to 32 characters` (32 accepted, 33 rejected). `crypto-adapters.test.ts` — `generates a guest key of three lowercase words joined by dashes` (`/^[a-z]+-[a-z]+-[a-z]+$/`), and `cannot generate a guest key longer than a guest key may be` (`3 * longest word + 2 <= GuestKey.MAX_LENGTH`, computed over the filtered list, plus `GuestKey.from(generated)` does not throw). `EnterGuestKey.test.ts` — `treats a key over 32 characters like any wrong key` (a 40-character key throws `InvalidGuestKeyError`, never a validation error; it holds because `GuestKey.matches` does not call `GuestKey.from`). Check whether the existing "produces non-empty, distinct values" test still holds unchanged.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS; verify (`--e2e`); commit `feat(api): three-word guest keys, at most 32 characters`.

### Task 5: Instance config endpoint (`GET /api/instance`)

**Base:** Task 1 (both touch `routes.ts` and its test). **Files (9):**
- Create: `apps/api/src/presentation/instanceConfig.ts`
- Modify: `apps/api/src/presentation/compositionRoot.ts`, `apps/api/src/presentation/routes.ts`, `apps/api/src/presentation/routes.integration.test.ts`, `apps/api/src/presentation/openApiDocument.ts`, `apps/api/src/presentation/openApiDocument.test.ts`, `apps/api/src/presentation/openApiDocument.noDatabase.test.ts`, `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- `instanceConfig.ts` exports `InstanceConfig = { sourceUrl: string; privacyContact: string | null }`, `instanceResponseSchema = z.object({ sourceUrl: z.string(), privacyContact: z.string().nullable() })` (no shared-types change) and `DEFAULT_SOURCE_URL = 'https://github.com/dtbiedrzycki/gubbins'`.
- `AppDependencies.instance: InstanceConfig` is required; `buildDependencies` defaults it from an optional `options.instance` to `{ sourceUrl: DEFAULT_SOURCE_URL, privacyContact: null }`.
- `GET /api/instance` (`operationId: getInstance`) — public (no session), returns `deps.instance`.

- [ ] **Step 1:** Route test `serves the source URL and privacy contact without a session`; the OpenAPI document tests list the new operation.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; regenerate OpenAPI + client. **Step 4:** PASS; verify (`--e2e`); commit `feat(api): serve the instance's source URL and privacy contact`.

### Task 5b: Read the instance settings from the environment

**Base:** Task 5. **Files (3):** Modify `apps/api/src/presentation/instanceConfig.ts`, `apps/api/src/presentation/server.ts` (`parseInstanceConfig(process.env)` passed to `buildDependencies`); Create `apps/api/src/presentation/instanceConfig.test.ts`.

**Interfaces:** `parseInstanceConfig(env: Record<string, string | undefined>): InstanceConfig` — trims; unset/blank `SOURCE_URL` → `DEFAULT_SOURCE_URL`; a set value must parse as an `http(s)` URL or startup fails (same style as `secretsConfig.ts`); blank `PRIVACY_CONTACT` → `null`.

- [ ] **Step 1:** `instanceConfig.test.ts`: default when unset or blank; a set URL is returned trimmed; a non-URL throws; `PRIVACY_CONTACT` blank → null.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; verify (`--e2e`); commit `feat(api): read SOURCE_URL and PRIVACY_CONTACT from the environment`.

### Task 6: Footer

**Base:** Task 5b. **Files (9):**
- Create: `apps/web/src/features/instance/useInstance.ts`, `apps/web/src/features/instance/Footer.tsx`, `apps/web/src/features/instance/Footer.test.tsx`
- Modify: `apps/web/src/App.tsx` (a layout route rendering `<Outlet />` then `<Footer />`), `apps/web/src/App.test.tsx`, `apps/web/src/api/client.ts` (`getInstance`), `apps/web/src/pages/CreateListPage.tsx`, `apps/web/src/pages/ListPage.tsx`, `apps/web/src/pages/ManagePage.tsx` (`min-h-screen` becomes `flex-1` so the footer sits at the bottom)

**Interfaces:** `useInstance()` — `useQuery({ queryKey: ['instance'], queryFn: api.getInstance, staleTime: Infinity })`. `Footer()` renders the spec's line without the Privacy link (that link ships with the privacy page, Task 11, so it never points at a page that isn't there): "Gubbins is free software under the AGPL-3.0 · Source on GitHub"; while loading or on error, "Source on GitHub" uses the default upstream URL (so the license link never disappears). `eslint-feature-boundary.test.ts` may constrain imports from `features/instance` — follow it.

- [ ] **Step 1:** Footer tests: `links the licence and the source URL the server gives`; `falls back to the upstream repository when the server can't be reached`. App test: mock `/api/instance` with the `mock()` helper.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Footer styling per mockup (`border-t border-line`, centered, `text-sm text-muted`). **Step 4:** PASS; verify (`--e2e`); commit `feat(web): footer with the license and a link to the source`.

### Task 7: Make the repository public with `main` protected (ops, no PR — the main session runs it)

- [ ] **Step 1: Scan history.** On a fresh clone (`git clone --mirror`) in the scratchpad: `git log --all -p` grepped for `-----BEGIN`, `ghp_`, `github_pat_`, `gho_`, `sk-`, `AKIA`, `xox[bp]-`, `SESSION_COOKIE_SECRET=.`, `CREATE_SECRET=.`, `password`; `git log --all --name-only --format= | sort -u | grep -Ei '\.env|\.pem|\.key|\.db$|secret'`; `git log --all --format='%an <%ae>%n%cn <%ce>' | sort -u`. Write findings to the scratchpad and report them to the owner.
- [ ] **Step 2:** If anything is found, stop: the repo stays private; any history rewrite is the owner's call, run by the owner.
- [ ] **Step 3: Ruleset.** `gh api repos/dtbiedrzycki/gubbins/rulesets -X POST` with target `branch`, include `~DEFAULT_BRANCH`, enforcement `active`, rules `pull_request` (0 required approvals), `non_fast_forward`, `deletion`; no bypass actors needed (the owner merges through PRs). If GitHub refuses it on a private repo (plan limit), apply it immediately after Step 4.
- [ ] **Step 4:** Owner approves in chat, then `gh repo edit dtbiedrzycki/gubbins --visibility public --accept-visibility-change-consequences`.
- [ ] **Step 5:** Check: `gh api repos/dtbiedrzycki/gubbins/rules/branches/main` lists `pull_request`, `non_fast_forward` and `deletion`, and `gh repo view --json visibility` says `PUBLIC`.

### Task 8: Filter by status

**Base:** Task 2 (`ListPage.tsx`). **Files:**
- Create: `apps/web/src/features/holds/ItemFilter.tsx`, `apps/web/src/features/holds/ItemFilter.test.tsx`
- Modify: `apps/web/src/features/holds/Seal.tsx` (add `size?: 'md' | 'sm'`, `sm` = `size-6.5`, text 14px), `apps/web/src/pages/ListPage.tsx`

**Interfaces:** `type ItemFilterValue = 'all' | 'available' | 'held' | 'purchased'`; `filterKey(item): Exclude<ItemFilterValue, 'all'>` — `'purchased'` when `status === 'purchased'` or (`type === 'group'` and `pledgedMinor >= priceMinor`), else `status`. `ItemFilter({ items, value, onChange })` renders four `aria-pressed` buttons in a `role="group"` labelled "Show gifts", labels "All · n", "Available · n", "Held · n", "Purchased or funded · n"; small seals only on the last two.

- [ ] **Step 1:** Tests: `counts a fully pledged group gift as funded, and a partly pledged one as available`; `marks only the chosen filter pressed and calls onChange with it`; `shows a seal only on Held and Purchased or funded`. ListPage: `shows only held gifts when Held is chosen`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (filter state local to `ListPage`, default `'all'`). **Step 4:** PASS; verify (`--e2e`); commit `feat(web): filter gifts by available, held and purchased`.

### Task 9: Venmo/Zelle switch with Zelle steps

**Base:** main. **Files:**
- Create: `apps/web/src/features/contribute/preferredPayMethod.ts`
- Modify: `apps/web/src/features/contribute/ContributeDialog.tsx`
- Test: `apps/web/src/features/contribute/ContributeDialog.test.tsx`

**Interfaces:** `type PayMethod = 'venmo' | 'zelle'`; `readPreferredPayMethod(): PayMethod | null` and `writePreferredPayMethod(method: PayMethod): void` over one `localStorage` key `gubbins.payMethod`, each wrapped in try/catch (blocked storage reads as null, writes are dropped). The dialog picks: the remembered method if the list offers it, else Venmo if offered, else Zelle. The switch is a radio group labelled "Pay with" with options "Venmo" and "Zelle", shown only when both handles exist; selecting writes the preference.

- [ ] **Step 1:** Tests: `starts on Venmo when the list offers both`; `shows only the chosen method's panel and remembers the choice for next time` (choose Zelle, unmount, render again → Zelle selected); `falls back to the method the list offers when the remembered one isn't` ; `still works when the browser blocks storage` (stub `localStorage.getItem`/`setItem` to throw); `shows no switch when the list offers one method`; Venmo panel text "Opens Venmo with the payment information pre-filled."; Zelle panel: three steps with the formatted amount and the item title, Copy button still present. Existing Venmo-link tests stay as they are.
- [ ] **Step 2:** FAIL. **Step 3:** Implement per spec goal 8 and the mockup (segmented control: two equal cells in a `border-ink` pill, chosen cell `bg-ink text-white`). **Step 4:** PASS; verify (`--e2e`; `e2e/guest-pledges.spec.ts` pays with Venmo, the default, so it should pass unchanged); commit `feat(web): switch between Venmo and Zelle, remembered on this device`.

## Set 2 (day 2): routes, pages, descriptions backend

### Task 10: Resource routes and the home page

**Base:** main after Task 6 merges (`App.tsx`). **Files (≤10):**
- Create: `apps/web/src/pages/HomePage.tsx`, `apps/web/src/pages/HomePage.test.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `apps/web/src/features/create-list/CreateListForm.tsx` (guest link `/wishlists/${slug}`, manage link `/wishlists/${slug}/manage`), `apps/web/src/features/create-list/CreateListForm.test.tsx`, `e2e/owner-adds-items.spec.ts`, `e2e/guest-pledges.spec.ts`, `e2e/guest-manages-a-hold.spec.ts` (`page.goto('/wishlists/new')`)

**Interfaces:** Routes: `/` HomePage, `/wishlists/new` CreateListPage, `/wishlists/:slug` ListPage, `/wishlists/:slug/manage` ManagePage, `/wishlists` → redirect `/wishlists/new`, legacy `/:slug` and `/:slug/manage` → `<Navigate replace>` to the new path with `location.hash` kept.

- [ ] **Step 1:** App tests: `serves the home page at /`, `serves the create form at /wishlists/new`, `redirects an old list link to /wishlists/:slug, keeping the #fragment`, `redirects an old manage link to /wishlists/:slug/manage`. HomePage test: the four points and "Got an invite? Open the link from it."; no link to create.
- [ ] **Step 2:** FAIL. **Step 3:** Implement per spec goal 9 and the mockup. **Step 4:** PASS; verify (`--e2e`); commit `feat(web): resource-style routes and a home page`.

### Task 11: Privacy page

**Base:** Task 10 (and Task 6's footer). **Files (5):** Create `apps/web/src/pages/PrivacyPage.tsx`, `apps/web/src/pages/PrivacyPage.test.tsx`; Modify `apps/web/src/App.tsx`, `apps/web/src/features/instance/Footer.tsx` (add " · Privacy" linking to `/privacy`), `apps/web/src/features/instance/Footer.test.tsx`.

Copy follows the spec's wording rule (no tracking of people, no ads; never "no analytics"). Before writing copy, confirm each claim against the code (what `guest_pii` stores, that no email is collected, that nothing is auto-deleted yet, the 30-day guest cookie and the session-only owner cookie, self-hosted fonts). State only what is true now.

- [ ] **Step 1:** Tests: `names the contact from the server when one is set`; `tells guests to contact whoever runs the site when no contact is set`; Footer test `links to the privacy page`.
- [ ] **Step 2–4:** FAIL → implement → PASS; verify (`--e2e`); commit `feat(web): privacy page`.

### Task 12: Images only from Gubbins itself

**Base:** main after Task 5 merges (both edit `routes.integration.test.ts`). **Files:** Modify `apps/api/src/presentation/app.ts` (an `onSend` hook setting `Content-Security-Policy: img-src 'self'` on every response, with a one-line why and a note that this is not the strict CSP); Test `apps/api/src/presentation/routes.integration.test.ts`.

- [ ] **Step 1:** Test `forbids images from other sites on every response` — the header is present on an API response (`GET /api/instance`) and on the SPA fallback (build the app with `webDist` pointing at a `mkdtemp` folder holding a one-line `index.html`, then `GET /wishlists/abc`).
- [ ] **Step 2–4:** FAIL → implement → PASS; verify (`--e2e`, which loads the real SPA, so a blocked image would surface in its axe/visual steps); commit `feat(api): allow images only from this site`.

### Task 13: Descriptions in the domain

**Base:** main. **Files:** Modify `apps/api/src/domain/entities/Item.ts`, `apps/api/src/domain/entities/Wishlist.ts`; Test `apps/api/src/domain/entities/Item.test.ts`, `apps/api/src/domain/entities/Wishlist.test.ts`; Modify test builders in `apps/api/src/application/test-fakes/` only if they must pass the new field.

**Interfaces:** `Item.description: string | null`, `Wishlist.description: string | null`. Factories (`createSingle`, `createGroup`, `Wishlist.create`, `Wishlist.addItem` props) take optional `description?: string | null`, trimmed at the ends, blank → `null`. `reconstitute` takes `description?: string | null` as stored. Private constructors enforce `ITEM_DESCRIPTION_MAX = 1000` and `WISHLIST_DESCRIPTION_MAX = 2000` with one-line whys; messages `'Item description must be at most 1000 characters'`, `'Wishlist description must be at most 2000 characters'`.

- [ ] **Step 1:** Tests: `limits an item's description to 1000 characters`, `limits a list's description to 2000 characters` (both via `reconstitute` too); `trims a description's ends but keeps the line breaks inside it`; `stores a blank description as none`.
- [ ] **Step 2–4:** FAIL → implement → PASS; verify (`--e2e`); commit `feat(api): optional descriptions on lists and items`.

### Task 14: Descriptions persisted

**Base:** Task 13. **Files:** Modify `apps/api/src/infrastructure/db/migrations/0001_init.ts` (nullable `description` text column on `wishlists` and `items`, edited in place), `apps/api/src/infrastructure/db/schema.ts`, `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`, `apps/api/src/infrastructure/ItemRepositoryKysely.ts`, `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`, and the in-memory fake in `apps/api/src/application/test-fakes/` if it copies fields.

- [ ] **Step 1:** Contract test `keeps a list's and an item's description, line breaks included, and none as none`.
- [ ] **Step 2–4:** FAIL → implement → PASS; verify (`--e2e`); commit `feat(api): store list and item descriptions`.
- **Heads-up for the PR body:** an existing local database lacks the columns; delete it (pre-release, migrations edited in place).

### Task 15: Descriptions accepted on create and add

**Base:** Task 14. **Files (7):** Modify `packages/shared-types/src/createList.ts` (`listDescription: z.string().optional()`), `packages/shared-types/src/addItem.ts` (`description: z.string().optional()` on both variants), `apps/api/src/application/use-cases/CreateList.ts` (`AddItem.ts` needs no change: the new field passes through), `apps/api/src/application/use-cases/CreateList.test.ts`, `apps/api/src/application/use-cases/AddItem.test.ts`, `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`.

- [ ] **Step 1:** One success-path assertion per use case: the persisted list/item carries the description.
- [ ] **Step 2–4:** FAIL → implement, regenerate → PASS; verify (`--e2e`); commit `feat(api): accept descriptions when creating a list or adding an item`.

## Set 3 (day 3): descriptions end to end, docs

### Task 16: Markdown and two-line clamp components

**Base:** main. **Files:** Modify `apps/web/package.json`, `package-lock.json` (add `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `remark-breaks@4.0.0`, exact versions); Create `apps/web/src/lib/Markdown.tsx`, `apps/web/src/lib/Markdown.test.tsx`, `apps/web/src/lib/ClampedText.tsx`, `apps/web/src/lib/ClampedText.test.tsx`.

**Interfaces:**
- `Markdown({ text }: { text: string })` — `react-markdown` with `remark-gfm` and `remark-breaks` (a single newline is a line break, so a shipping address typed one line per row stays that way), `skipHtml`, `allowedElements={['p','br','strong','em','ul','ol','li','a']}`, `unwrapDisallowed`, a `urlTransform` that returns the URL only for `http:`/`https:` (else `''`, and the link renders as text), links `target="_blank" rel="noopener noreferrer nofollow ugc"`.
- `ClampedText({ children, id })` — clamps to 2 lines (`line-clamp-2`); measures `scrollHeight > clientHeight` after layout and on resize; renders "Show more"/"Show less" (`aria-expanded`, `aria-controls={id}`) only when it overflows.

- [ ] **Step 1:** Markdown tests: `renders bold, italics, lists and links`; `turns a bare https URL into a link`; `drops javascript: and data: links, keeping the text`; `keeps each line of a multi-line address on its own line`; `keeps the text of headings, code and quotes without their elements`; `renders no image and no raw HTML` (`container.querySelector('img, script')` is null for `![x](http://e.com/a.png)` and `<img src=x>`); `opens links in a new tab without passing on the page`. ClampedText: `offers Show more only when the text overflows two lines` (stub `scrollHeight`/`clientHeight`); `toggles between Show more and Show less`.
- [ ] **Step 2–4:** FAIL → implement → PASS; verify (`--e2e`); commit `feat(web): safe markdown and a two-line clamp`.

### Task 17: Descriptions in the list view

**Base:** Task 15 after Task 8 merges. **Files (9):** Modify `packages/shared-types/src/listView.ts` (`description: z.string().nullable()` on the list and on `listItemSchema`), `apps/api/src/application/use-cases/GetListView.ts`, `apps/api/src/application/use-cases/GetListView.test.ts`, `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`, and the item fixtures in `apps/web/src/features/holds/ItemView.test.tsx`, `apps/web/src/features/holds/useHoldItem.test.tsx`, `apps/web/src/features/holds/YourHolds.test.tsx`, `apps/web/src/pages/ListPage.test.tsx` (add `description: null`).

- [ ] **Step 1:** GetListView test: the view carries the list's and each item's description.
- [ ] **Step 2–4:** FAIL → implement → PASS; verify (`--e2e`); commit `feat(api): show descriptions in the list view`.

### Task 18: Show descriptions to guests

**Base:** Task 17 after Task 16 merges. **Files:** Modify `apps/web/src/pages/ListPage.tsx` (list description under the header, section labelled "About this list"), `apps/web/src/features/holds/ItemView.tsx` (under the price); Test `apps/web/src/pages/ListPage.test.tsx`, `apps/web/src/features/holds/ItemView.test.tsx`.

- [ ] **Step 1:** Tests: `shows the list's description above the gifts`; `shows an item's description under its price`; nothing rendered when `null`.
- [ ] **Step 2–4:** FAIL → implement with `<ClampedText><Markdown text=… /></ClampedText>` → PASS; verify (`--e2e`); commit `feat(web): show list and item descriptions`.

### Task 19: Description fields on the owner's forms

**Base:** Task 18 after Task 10 merges. **Files:** Modify `apps/web/src/features/create-list/CreateListForm.tsx`, `apps/web/src/features/create-list/CreateListForm.test.tsx`, `apps/web/src/features/manage/AddItemForm.tsx`, `apps/web/src/features/manage/AddItemForm.test.tsx`.

**Interfaces:** `LimitedTextarea` labelled "About this list (optional)" (max 2000) with the spec's hint; "Description (optional)" on the add-item form (max 1000) with "Supports **bold**, *italics*, lists and links. You can't change it after adding the item." Both send the trimmed text, omitted when blank. The create page's guest key gets the mockup's large type.

- [ ] **Step 1:** Tests: `limits the list description to 2000 characters` / `limits the item description to 1000 characters`; `sends the description trimmed, and leaves it out when blank`.
- [ ] **Step 2–4:** FAIL → implement → PASS; verify (`--e2e`); commit `feat(web): description fields when creating a list and adding an item`.

### Task 20: Docs

**Base:** main, last. **Files:** `docs/adr/0052-*.md` (amend: word keys, 7,772 words, ~38.8 bits, 32-character cap, reliance on unbuilt rate limiting with the spec's brute-force estimates), `docs/spec/access-identity.md` (30-day guest cookie; every old route shape), `docs/spec/guest-ux.md`, `docs/spec/holds.md`, `docs/spec/privacy.md`, `docs/spec/threat-model-summary.md` and `docs/spec/owner-dashboard.md` (route paths; grep `docs/spec` for `/{slug}` to catch the rest), `docs/deploy.md` and `.env.example` (`SOURCE_URL`, `PRIVACY_CONTACT`), `README.md` (create at `/wishlists/new`). That is 10 files; if the grep finds more, split into Task 20 and 20b.

- [ ] **Step 1:** Make the edits; `verify.sh --e2e` (its docs-links job checks links); commit `docs: word keys, 30-day guest session, new routes, instance settings`.

---

## Execution notes (main session)

- Write the spec's owner rulings into a scratch rulings file before dispatching the first implementer.
- Per task: implementer subagent → R1 reviewer → fixer → R2 on changed PRs only (skill `running-review-rounds`). Open each PR as ready once verified.
- Merge-ups: once per set, through the highest ready PR only.
