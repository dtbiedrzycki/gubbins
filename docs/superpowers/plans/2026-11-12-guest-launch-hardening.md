# Guest launch hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests sign in from the invite link, keep their sessions, and never get stuck or misled by an error, before the first production guests arrive.

**Architecture:** Mostly web changes (`apps/web`): a shared error-text function in `lib/`, query-client network settings, fragment sign-in on the list page, a router error page, dialog fixes. API changes are small and in `presentation/` and `domain/value-objects/` plus one migration. No OpenAPI contract change.

**Tech Stack:** Fastify 5 + better-sqlite3/Kysely, React 19 + TanStack Query 5 + React Router, vitest + MSW, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-12-guest-launch-hardening-design.md` — read it alongside each task; copy and rules tables live there, not here.

## Global Constraints

- Every PR changes **10 files or fewer** (`git diff --stat <base>...HEAD | tail -1`); at most 8 stacked PRs open.
- Each PR: two review rounds before opening (skill running-review-rounds), the local verify script green, with `--e2e` when targeting `main` (skill verifying-gubbins-locally says where it is and how to run it). Use a worktree; `/workspace` is shared.
- One test per rule, at the layer that decides it (skill testing-at-the-owning-layer). No plan identifiers in test names or comments; domain instants are `at`.
- No new dependencies. No OpenAPI contract change. No edits to released migrations `0001`/`0002`.
- Web vitest locally needs `--testTimeout=30000`.
- Browser storage reads and writes are wrapped in try/catch; the page works without storage.
- The guest key never appears in a URL sent to the server or in logs; "no such list" and "wrong key" stay indistinguishable (ADR-0016/0054).
- PR descriptions per skill writing-pr-descriptions; never link claude.ai artifacts.

## Review Focus

1. **Fragment key with `%`-encoded or junk content** (`#key=`, `#key=%E0`, `#foo=bar`): no crash; empty or undecodable → treat as no key, still cleared from the address bar. Test in Task 9.
2. **Old `path: '/'` cookie alongside the new per-list cookie**: the per-list one wins; a guest with only the old one gets the generic 404 and the key screen, not a 500. Test in Task 2.
3. **Draft for an item the owner has since deleted or fully funded**: dialog does not reopen, draft removed. Test in Task 14.
4. **Timeout on a purchase that actually succeeded**: falls into `main`'s lost-answer path and reports success once the refetch shows `purchased`; no automatic re-send. Test in Task 13.
5. **Stale-chunk reload loop**: the auto-reload fires at most once per tab session even if storage throws (then: never auto-reload, show the error page). Test in Task 5.

---

## PR order and bases

| Task | PR | Base |
|---|---|---|
| 0 | Spec + plan docs | `main` |
| 1 | Forgiving typed keys | `main` |
| 2 | Per-list, renewed session cookies | `main` |
| 3 | Narrow slug lookup | Task 2 |
| 4 | Items index migration | `main` |
| 5 | Crash and not-found pages | `main` |
| 6 | Offline fails fast, 15 s timeout | `main` |
| 7 | Shared error text in `lib/` | `main` |
| 8 | Key screen errors and "Opening…" | Task 7 |
| 9 | Sign in from the link fragment | Task 8 |
| 10 | One invite link | Task 9 |
| 11 | Guest error text: hold and purchase | Task 7 |
| 12 | Guest error text: chip-in and list page | Task 9 |
| 13 | Already-worked retries, purchase sheet keeps message | Task 11 |
| 14 | Chip-in draft survives Venmo | Task 12 |
| 15 | Deploy doc | `main` |

Retarget each stacked PR to `main` before its base branch is deleted.

---

### Task 0: Spec and plan docs PR

**Files:** `docs/superpowers/specs/2026-11-12-guest-launch-hardening-design.md`, `docs/superpowers/plans/2026-11-12-guest-launch-hardening.md`

- [ ] Two review rounds, then open the PR from branch `docs/guest-launch-hardening-spec`.

### Task 1: Forgiving typed keys

**Files:** Modify `apps/api/src/domain/value-objects/GuestKey.ts`; Test `apps/api/src/domain/value-objects/GuestKey.test.ts`

**Interfaces:** Produces: `GuestKey.matches(candidate, comparer)` unchanged signature; normalises the candidate when `this.value` is a word key.

- [ ] **Step 1: Failing tests** — one `it.each` over the spec's input matrix against stored `maple-lantern-otter` (accepted: trimmed, upper-case, spaces, mixed spaces and dashes; refused: underscores, dots, joined, two words), plus `it('matches a key that is not three words exactly as typed')` with a stored base64url-shaped value (`'AbC_d-0123456789abcdefghijklmnopq'`) refusing its lower-cased form.
- [ ] **Step 2:** `npm -w apps/api run test -- GuestKey` → FAIL on the forgiving rows.
- [ ] **Step 3: Implement** in `matches`: if `this.value` matches `/^[a-z]+(-[a-z]+)+$/`, candidate = `candidate.trim().toLowerCase().replace(/[\s-]+/g, '-')`; else `candidate.trim()`. Constant-time compare unchanged. No length check on the candidate.
- [ ] **Step 4:** Tests pass; `EnterGuestKey.test.ts` "over 32 characters" still passes unchanged.
- [ ] **Step 5:** Commit `feat: typed guest keys ignore capitals and spacing`.

### Task 2: Per-list, renewed session cookies

**Files:** Modify `apps/api/src/presentation/accessContext.ts`, `apps/api/src/presentation/routes.ts`; Test `apps/api/src/presentation/routes.integration.test.ts`

**Interfaces:** Produces in `accessContext.ts`: `listCookiePath(slug: string): string` → `` `/api/lists/${encodeURIComponent(slug)}` ``; `guestSessionCookieOptions(slug)` and `ownerCookieOptions(slug)` returning the existing option objects with that `path`. Cookie names unchanged.

Mechanism (decided): scope by `path`. Every list route is under `/api/lists/:slug`, so names and readers stay as they are.

- [ ] **Step 1: Failing integration tests** in `routes.integration.test.ts`:
  - `it('keeps a guest's session for one list after they enter the key for another')`: enter key for A, then B (cookie jar honouring paths, or send each list's cookie only to its path); `GET /api/lists/A` → 200 with A's earlier hold in `myHolds`.
  - `it('renews the guest session cookie on every accepted request')`: `GET /api/lists/:slug` with a valid session → response has `set-cookie` for `gubbins_session` with `Max-Age=2592000` and `Path=/api/lists/<slug>`.
  - `it('scopes the owner cookie to its list')`: `owner-session` response `set-cookie` has `Path=/api/lists/<slug>`.
  - `it('answers a session cookie set for another list with the generic 404')` (covers Review Focus 2: old `/`-path cookie for list B sent to list A → 404 `NOT_FOUND` body).
- [ ] **Step 2:** Run the file → FAIL.
- [ ] **Step 3: Implement**: use the new options in both `setCookie` calls; in `guestAccess`, after a valid access, `reply.setCookie(SESSION_COOKIE, <same payload>, guestSessionCookieOptions(slug))` — pass `reply` into `guestAccess` (change its signature to `(request, reply, slug)` and update its callers in `routes.ts`).
- [ ] **Step 4:** File passes; full api suite green.
- [ ] **Step 5:** Commit `fix: guest and owner cookies are per list, and the guest's renews on use`. PR description says the owner re-enters their token once after deploy.

### Task 3: Narrow slug lookup

**Files:** Modify `apps/api/src/application/ports/WishlistRepository.ts`, `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`, `apps/api/src/application/test-fakes/InMemoryRepositories.ts`, `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`, `apps/api/src/presentation/routes.ts`

**Interfaces:** Produces `WishlistRepository.findAccessBySlug(slug: string): Promise<{ id: string; keyGen: number } | null>`.

- [ ] **Step 1: Failing contract tests**: `findAccessBySlug` returns `{ id, keyGen }` for a saved list (and the bumped `keyGen` after a rotation), `null` for an unknown slug.
- [ ] **Step 2:** Contract suite FAILs for both adapters.
- [ ] **Step 3: Implement** in both adapters (Kysely: `select id, key_gen from wishlists where slug = ?`). In `guestAccess`/`ownerAccess`, use it instead of `findBySlug`; return `{ wishlistId, access }`. Callers that used `wishlist` from the helper only for its id switch to `wishlistId`; use cases keep loading the list themselves.
- [ ] **Step 4:** api unit + integration suites green.
- [ ] **Step 5:** Commit `perf: guest and owner access look up only the list's id and key generation`.

### Task 4: Items index migration

**Files:** Create `apps/api/src/infrastructure/db/migrations/0003_items_wishlist_index.ts`; Modify `apps/api/src/infrastructure/db/migrations/index.ts`; Test `apps/api/src/infrastructure/db/runMigrations.integration.test.ts`

- [ ] **Step 1: Failing test** `it('indexes items by list and position')`: after `runMigrations`, `pragma index_list('items')` includes `items_wishlist_position`, and `pragma index_info` lists `wishlist_id`, `position` in that order.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `up`: `create index items_wishlist_position on items(wishlist_id, position)`; register as `'0003_items_wishlist_index'`.
- [ ] **Step 4:** Green, including `schema.integration.test.ts` (`assertSchemaMatches` ignores indexes).
- [ ] **Step 5:** Commit `perf: index items by list and position`.

### Task 5: Crash and not-found pages

**Files:** Create `apps/web/src/pages/ErrorPage.tsx`, `apps/web/src/pages/NotFoundPage.tsx`; Modify `apps/web/src/App.tsx`, `apps/api/src/presentation/app.ts`; Test `apps/web/src/App.test.tsx`, `apps/api/src/presentation/routes.integration.test.ts`

**Interfaces:** Produces `ErrorPage` (router `errorElement` on the layout route) and `NotFoundPage` (`path: '*'`).

- [ ] **Step 1: Failing tests**:
  - API: `it('answers a missing asset with 404, not the app page')`: `GET /assets/nope.js` with `webDist` → 404; `GET /wishlists/x` → 200 HTML (existing).
  - Web `App.test.tsx`: `it('shows a reload page when a page fails to render')` (a route element that throws → heading "Something went wrong." and a "Reload" button; no error text); `it('shows a not-found page for an unknown address')` (`/nope` → link home); `it('reloads once when a page's code fails to load')` (lazy import rejects with `TypeError('Failed to fetch dynamically imported module')` → `location.reload` called once; second time in the same session → ErrorPage, no reload); `it('does not reload when session storage is unavailable')` (storage throws → ErrorPage, no reload).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: `app.ts` not-found handler sends 404 for `request.url.startsWith('/assets/')`. `ErrorPage` uses `useRouteError()`; if it is a dynamic-import failure and `sessionStorage['gubbins:chunk-reload']` is unset (try/catch; on throw, don't reload), set it and `location.reload()`; otherwise render the frame. `ErrorPage` renders its own header/footer (the layout's `Outlet` is not there when the layout errors). Copy per spec.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `feat: reload and not-found pages replace the router's crash screen`.

### Task 6: Offline fails fast, 15 s timeout

**Files:** Create `apps/web/src/api/queryClient.ts`, `apps/web/src/api/queryClient.test.ts`; Modify `apps/web/src/main.tsx`, `apps/web/src/api/client.ts`; Test `apps/web/src/api/client.test.ts`

**Interfaces:** Produces `queryClient` (exported `QueryClient`, `staleTime: 30_000` kept, `networkMode: 'always'` for queries and mutations); `REQUEST_TIMEOUT_MS = 15_000` in `client.ts`.

- [ ] **Step 1: Failing tests**: `queryClient.test.ts` `it('fails a mutation at once when the browser says it is offline')` (`onlineManager.setOnline(false)`, mutation whose fn rejects with `ApiError(0, …)` → settles as error, not paused); `client.test.ts` `it('gives up on a request after 15 seconds')` (fake timers, MSW handler that never resolves → `ApiError` with status 0).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: `main.tsx` imports `queryClient`; `client.ts` fetch passes `{ signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }` (merge with `request.signal` via `AbortSignal.any` if the request has one); the existing catch maps the abort to status 0.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: offline and unanswered requests fail instead of hanging`.

### Task 7: Shared error text in `lib/`

**Files:** Move `apps/web/src/features/manage/actionErrorMessage.ts` → `apps/web/src/lib/actionErrorMessage.ts` and its test; Modify imports in `AddItemForm.tsx`, `EditItemForm.tsx`, `EditListDetailsForm.tsx`, `ManageItems.tsx`

**Interfaces:** Produces `actionErrorMessage(error: Error, couldnt: string): string` in `lib/`, following the spec's error-text table in order.

- [ ] **Step 1: Failing tests** added to the moved test: `it('tells the guest to reload on a 404')` → `` `${couldnt} Reload the page to see the list as it is now.` ``; `it('treats a malformed-request 400 as our fault')` (`ApiError(400, 'Invalid request')` → the "our end" text); existing cases kept.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** the two rules. Owner forms are unaffected by the 404 rule (they handle 404 first); check their tests.
- [ ] **Step 4:** Web suite green; `eslint-feature-boundary.test.ts` passes (`lib/` importable from features).
- [ ] **Step 5:** Commit `refactor: error text for failed actions lives in lib for guests and owners`.

### Task 8: Key screen errors and "Opening…"

**Files:** Modify `apps/web/src/features/guest-key/GuestKeyGate.tsx`, `apps/web/src/features/guest-key/useEnterGuestKey.ts`, `apps/web/src/pages/ListPage.tsx`; Test `apps/web/src/features/guest-key/GuestKeyGate.test.tsx`

**Interfaces:** Consumes `actionErrorMessage`. Produces `useEnterGuestKey(slug: string, onEntered: () => Promise<unknown>)` — `mutationFn` awaits the POST then `onEntered()`, so `isPending` covers the list load. `GuestKeyGateProps.onSuccess: () => Promise<unknown>`.

- [ ] **Step 1: Failing tests**: `it('says the list could not be found only for a 404')`; `it.each([0, 500, 502])('asks the guest to try again when checking fails with %i')` → `actionErrorMessage` text with "Couldn't check the key."; `it('keeps the button busy until the list has loaded')` ("Opening…" disabled while `onSuccess`'s promise is pending).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**; `ListPage` passes `() => query.refetch()`. Button label: "Checking…" while posting, "Opening…" while `onEntered` runs.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: the key screen blames the key only when the list was not found`.

### Task 9: Sign in from the link fragment

**Files:** Create `apps/web/src/features/guest-key/fragmentKey.ts`, `apps/web/src/features/guest-key/fragmentKey.test.ts`; Modify `GuestKeyGate.tsx`, `ListPage.tsx`; Test `GuestKeyGate.test.tsx`, `apps/web/src/pages/ListPage.test.tsx`

**Interfaces:** Produces `takeFragmentKey(): string | null` (reads `key` from `location.hash` via `URLSearchParams`, always clears the fragment with `history.replaceState(history.state, '', pathname + search)`, returns null for missing/empty/undecodable). `GuestKeyGateProps.initialKey?: string`, `autoSubmit?: boolean`.

- [ ] **Step 1: Failing tests**:
  - `fragmentKey.test.ts`: returns `maple-lantern-otter` for `#key=maple-lantern-otter` and clears the hash; `it.each(['', '#key=', '#foo=bar', '#key=%E0'])` → null and the hash is cleared when present.
  - `ListPage.test.tsx`: `it('opens the list from the invite link without asking for the key')` (list 404 then session 200 then list 200 → items shown, key screen never shown); `it('ignores the link's key when the guest is already in')` (list 200 → no session POST); `it('shows the key screen with the link's key filled in when it is refused')` (session 404 → input value is the key, "This list could not be found."); `it('keeps the link's key for a retry when the server cannot be reached')` (session → network error → input prefilled, offline text).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: `ListPage` calls `takeFragmentKey()` once (state initialiser) before anything renders; passes it as `initialKey` with `autoSubmit` to the gate. The gate auto-submits once on mount when `autoSubmit`, and while that first attempt is pending renders the list page's "Loading…" view instead of the form.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `feat: guests open a list straight from the invite link`.

### Task 10: One invite link

**Files:** Modify `apps/web/src/lib/InvitationCard.tsx`, `apps/web/src/lib/links.ts`; Test `apps/web/src/lib/InvitationCard.test.tsx`, `apps/web/src/features/create-list/CreateListForm.test.tsx` (if it reads the key line); e2e `e2e/guest-holds-several.spec.ts`, `e2e/guest-manages-a-hold.spec.ts`, `e2e/guest-pledges.spec.ts`, `e2e/owner-adds-items.spec.ts`, `e2e/owner-edits-a-list.spec.ts`, `e2e/owner-reorders-gifts.spec.ts`

**Interfaces:** Produces `invitePath(slug: string, guestKey: string): string` → `` `${listPath(slug)}#key=${encodeURIComponent(guestKey)}` ``. `InvitationCardProps` unchanged.

- [ ] **Step 1: Failing tests**: `InvitationCard.test.tsx` `it('offers one link that carries the key')` (link text/href end with `#key=maple-lantern-otter`; one "Copy link" button; no "Copy key" button; no `data-testid="guest-key"`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** per spec (heading copy suited to one link). e2e specs take `guestLink` (with fragment) and `goto` it instead of filling the key; **keep one** spec (`guest-manages-a-hold`) typing the key on the bare path so the fallback stays covered. If the file count passes 10, move the e2e updates for owner-* specs into a follow-up PR on top.
- [ ] **Step 4:** Web suite + the verify script with `--e2e` green.
- [ ] **Step 5:** Commit `feat: the invite is one link with the key in it`.

### Task 11: Guest error text — hold and purchase

**Files:** Modify `apps/web/src/features/holds/HoldDialog.tsx`, `PurchaseDialog.tsx`, `HoldActions.tsx`; Test `HoldDialog.test.tsx`, `PurchaseDialog.test.tsx`, `YourContributions.test.tsx`

**Interfaces:** Consumes `actionErrorMessage`. `HoldActions`' local `failureMessage` is replaced by it.

- [ ] **Step 1: Failing tests** (one per dialog, the 500 case is enough to prove routing): HoldDialog 500 → "Couldn't hold ‹title›. Something went wrong on our end…"; PurchaseDialog body-less 502 (`Request failed`) → the same "our end" text with its lead-in; YourContributions release 404 → "…Reload the page…".
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**; lead-ins short, per screen (spec leaves wording to builder). Existing `tooFew`/`recapped` notes stay first.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: hold and purchase errors tell guests what to do`.

### Task 12: Guest error text — chip-in and list page

**Files:** Modify `apps/web/src/features/contribute/ContributeDialog.tsx`, `apps/web/src/pages/ListPage.tsx`; Test `ContributeDialog.test.tsx`, `ListPage.test.tsx`

- [ ] **Step 1: Failing tests**: ContributeDialog 500 → "our end" text; ListPage first-load 500 → "Couldn't load the list. Something went wrong on our end…" with "Try again"; ListPage 404 still shows the key screen (existing test kept).
- [ ] **Step 2–4:** FAIL → implement → green.
- [ ] **Step 5:** Commit `fix: chip-in and list errors tell guests what to do`.

### Task 13: Already-worked retries; purchase sheet keeps the message

**Files:** Modify `apps/web/src/features/holds/HoldActions.tsx`; Test `YourContributions.test.tsx`, `PurchaseDialog.test.tsx` (sheet tests live where `main`'s lost-purchase tests are; follow them)

**Interfaces:** None new.

- [ ] **Step 1: Failing tests**:
  - `it('reports an extension that already went through as extended')`: extend → 409 "already extended", refetch shows extended → normal extended outcome.
  - `it('reports a release that already went through as released')`: release → 409 `hold_not_active` (and → 404), refetch without the hold → released outcome.
  - `it('reports a purchase the server already has as purchased')`: purchase → 409 `hold_not_active`, refetch shows `purchased` → success message.
  - `it.each([['server error', 500], ['proxy error', 502], ['clash', 409 /* no code */]])('keeps the purchase sheet and message open after a %s')`.
  - Review Focus 4: `it('reports a timed-out purchase as purchased when the list shows it bought')` (status 0 + refetch purchased → success; exactly one POST sent).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: on those codes, await the list refetch and decide from the refetched hold; sheet `onError` keeps open for status 0, ≥ 500, non-`ApiError`, code-less 409 and `item_unavailable`.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: a hold action that already worked is reported as done`.

### Task 14: Chip-in draft survives Venmo

**Files:** Create `apps/web/src/features/contribute/contributeDraft.ts`, `contributeDraft.test.ts`; Modify `ContributeDialog.tsx`, `apps/web/src/pages/ListPage.tsx` (or `ItemView.tsx`, wherever the dialog is opened); Test `ContributeDialog.test.tsx`, `ListPage.test.tsx`

**Interfaces:** Produces
```ts
interface ContributeDraft { itemId: string; step: string; amountText: string; message: string; idempotencyKey: string; savedAt: number }
loadDraft(slug: string, now: number): ContributeDraft | null   // null and removes it when older than 24 h
saveDraft(slug: string, draft: ContributeDraft): void
clearDraft(slug: string): void
```
Storage key `gubbins:contribute-draft:${slug}` in `localStorage`; every access in try/catch.

- [ ] **Step 1: Failing tests**:
  - `contributeDraft.test.ts`: round-trips; `loadDraft` at `savedAt + 24h + 1ms` → null and key removed; storage that throws → null / no-op.
  - `ListPage.test.tsx`: `it('reopens a chip-in the guest left for Venmo')` (draft present → dialog open at saved step with amount and message); Review Focus 3: `it.each(['deleted', 'fully funded'])('drops a draft for a gift that is %s')` → no dialog, key removed.
  - `ContributeDialog.test.tsx`: `it('sends the saved pledge key so a pledge already made is not doubled')`; `it('clears the draft on cancel')`; `it('clears the draft once the pledge is recorded')`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: dialog saves on each change of step/amount/message; takes an optional `draft` prop to start from; list page loads the draft once per mount and opens the matching item's dialog if it is still open for contributions.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `feat: a chip-in in progress survives leaving for the payment app`.

### Task 15: Deploy doc

**Files:** Modify `docs/deploy.md`

- [ ] Replace the "Until go-live … `down -v`" paragraph per spec: upgrade is `up -d --build`; migrations run at start-up; never `down -v` on production; stop the server before running `migrate` or `rebuild-projections` against the live database.
- [ ] Commit `docs: upgrading never deletes the production database`.
