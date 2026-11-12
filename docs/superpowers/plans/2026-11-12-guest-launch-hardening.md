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

1. **Fragment key with `%`-encoded or junk content** (`#key=`, `#key=%E0`, `#foo=bar`): no crash; empty or undecodable (`URLSearchParams` decodes `%E0` to U+FFFD) → treat as no key; the `key` parameter leaves the address bar, any other fragment content stays. Test in Task 9.
2. **Old `path: '/'` cookie alongside the new per-list cookie**: the per-list one wins because the browser sends the longer-path cookie first (RFC 6265 §5.4) and `@fastify/cookie` keeps the first of two same-named cookies. That ordering is browser behaviour, which `app.inject` cannot show; Task 2's PR description states it. A stale cookie for another list already gets the generic 404 (`accessContext.test.ts` "gives no guest credential for a session for another list").
3. **Draft for an item the owner has since deleted or fully funded**: dialog does not reopen, draft removed. Test in Task 14.
4. **Timeout on a purchase that actually succeeded**: a timeout is the same `ApiError(0)` as a network failure, so it takes `main`'s lost-answer path, already tested by `YourContributions.test.tsx` "thanks the guest when the refetch after a network failure shows the purchase went through". No automatic re-send (there is no retry code). No new test.
5. **Stale-chunk reload loop**: the auto-reload fires once, and a failure straight after it shows the error page; the guard clears once a page renders. If storage throws, never auto-reload; show the error page. Test in Task 5.

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
| 6 | Offline fails fast, 7 s timeout | `main` |
| 7 | Shared error text in `lib/` | `main` |
| 8 | Key screen errors and "Opening…" | Task 7 |
| 9 | Sign in from the link fragment | Task 8 |
| 10a | One invite link: card and unit tests | Task 9 |
| 10b | One invite link: e2e specs | Task 10a |
| 11 | Guest error text: hold and purchase | Task 7 |
| 12 | Guest error text: chip-in and list page | Task 9 |
| 13 | Already-worked retries, purchase sheet keeps message | Task 11 |
| 14 | Chip-in draft survives Venmo | Task 12 |
| 15 | Deploy doc | `main` |

Retarget each stacked PR to `main` before its base branch is deleted. 10a and 10b open together: 10a leaves e2e red (the specs still read the removed key line) and its description says e2e goes green with 10b.

---

### Task 0: Spec and plan docs PR

**Files:** `docs/superpowers/specs/2026-11-12-guest-launch-hardening-design.md`, `docs/superpowers/plans/2026-11-12-guest-launch-hardening.md`

- [ ] Two review rounds, then open the PR from branch `docs/guest-launch-hardening-spec`.

### Task 1: Forgiving typed keys

**Files:** Modify `apps/api/src/domain/value-objects/GuestKey.ts`; Test `apps/api/src/domain/value-objects/GuestKey.test.ts`

**Interfaces:** Produces: `GuestKey.matches(candidate, comparer)` unchanged signature; normalises the candidate when `this.value` is a word key.

- [ ] **Step 1: Failing tests** against stored `maple-lantern-otter`, rows from the spec's input matrix (the plain-trim row is already `bearerSecrets.test.ts` "trims the candidate before comparing"):
  - `it.each(['Maple-Lantern-Otter', 'MAPLE-LANTERN-OTTER', 'maple lantern otter', 'maple  lantern   otter', 'maple - lantern - otter', 'maple--lantern-otter'])('accepts %s typed for maple-lantern-otter')`.
  - `it.each(['maple_lantern_otter', 'maple.lantern.otter', 'maplelanternotter', 'maple-lantern'])('refuses %s typed for maple-lantern-otter')`.
  - `it('compares a key that is not three words exactly as typed, spaces included')`: stored `'AbC_d-0123456789abcdefghijklmnopq'` refuses `'AbC_d 0123456789abcdefghijklmnopq'` (the candidate word-key normalisation would wrongly accept).
- [ ] **Step 2:** `npm -w apps/api run test -- GuestKey` → FAIL on the accepted rows.
- [ ] **Step 3: Implement** in `matches`: if `this.value` matches `/^[a-z]+(-[a-z]+){2}$/`, candidate = `candidate.trim().toLowerCase().replace(/[\s-]+/g, '-')`; else `candidate.trim()`. One-line why-comment: that is the shape `generateGuestKey` and `isGuestKey` produce; older base64url keys keep exact matching. Constant-time compare unchanged. No length check on the candidate.
- [ ] **Step 4:** Tests pass; `EnterGuestKey.test.ts` "over 32 characters" still passes unchanged.
- [ ] **Step 5:** Commit `feat: typed guest keys ignore capitals and spacing`.

### Task 2: Per-list, renewed session cookies

**Files:** Modify `apps/api/src/presentation/accessContext.ts`, `apps/api/src/presentation/routes.ts`; Test `apps/api/src/presentation/routes.integration.test.ts`

**Interfaces:** Produces in `accessContext.ts`: `listCookiePath(slug: string): string` → `` `/api/lists/${encodeURIComponent(slug)}` ``; `guestSessionCookieOptions(slug)` and `ownerCookieOptions(slug)` returning the existing option objects with that `path`. Cookie names unchanged.

Mechanism (decided): scope by `path`. Every list route is under `/api/lists/:slug`, so names and readers stay as they are.

- [ ] **Step 1: Failing integration tests** in `routes.integration.test.ts` (`app.inject` has no cookie jar, so only what the server sets is testable here; which cookie a browser sends is not):
  - `it.each([['guest', '/session'], ['owner', '/owner-session']])('scopes the %s cookie to its list's API path')`: the `set-cookie` has `Path=/api/lists/<slug>`. Both rows stay in this `it.each`; the existing "sets a session cookie for the correct key" is left alone.
  - `it('renews the guest session cookie on every accepted request')`: `GET /api/lists/:slug` with a valid session → response has `set-cookie` for `gubbins_session` with `Max-Age=2592000` and `Path=/api/lists/<slug>`.
- [ ] **Step 2:** Run the file → FAIL.
- [ ] **Step 3: Implement**: use the new options in both `setCookie` calls; in `guestAccess`, after a valid access, `reply.setCookie(SESSION_COOKIE, <same payload>, guestSessionCookieOptions(slug))` — pass `reply` into `guestAccess` (change its signature to `(request, reply, slug)` and update its callers in `routes.ts`).
- [ ] **Step 4:** File passes; full api suite green.
- [ ] **Step 5:** Commit `fix: guest and owner cookies are per list, and the guest's renews on use`. PR description says old `/` cookies keep working and nobody re-enters the key or token, and that the browser sends the longer-path cookie first (RFC 6265 §5.4).

### Task 3: Narrow slug lookup

**Files:** Modify `apps/api/src/application/ports/WishlistRepository.ts`, `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`, `apps/api/src/application/test-fakes/InMemoryRepositories.ts`, `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`, `apps/api/src/presentation/routes.ts`; Test `apps/api/src/presentation/routes.integration.test.ts` (6 files)

**Interfaces:** Produces `WishlistRepository.findAccessBySlug(slug: string): Promise<{ id: string; keyGen: number } | null>`.

- [ ] **Step 1: Failing contract tests**: `findAccessBySlug` returns `{ id, keyGen }` for a saved list seeded through `Wishlist.reconstitute` with a non-default `keyGen` (e.g. `3`; the domain has no rotation command), `null` for an unknown slug. In `routes.integration.test.ts`, "answers a request without a valid session cookie without reading any list, as for an unknown slug" spies on `deps.wishlists.findBySlug`, which the guard no longer calls: switch the spy to `findAccessBySlug` so the test still proves the guard runs first.
- [ ] **Step 2:** Contract suite FAILs for both adapters.
- [ ] **Step 3: Implement** in both adapters (Kysely: `select id, key_gen from wishlists where slug = ?`). In `guestAccess`/`ownerAccess`, use it instead of `findBySlug`; return `{ wishlistId, access }`. Callers that used `wishlist` from the helper only for its id switch to `wishlistId`; use cases keep loading the list themselves.
- [ ] **Step 4:** api unit + integration suites green.
- [ ] **Step 5:** Commit `perf: guest and owner access look up only the list's id and key generation`.

### Task 4: Items index migration

**Files:** Create `apps/api/src/infrastructure/db/migrations/0003_items_wishlist_index.ts`; Modify `apps/api/src/infrastructure/db/migrations/index.ts`; Test `apps/api/src/infrastructure/db/schema.integration.test.ts` (3 files)

- [ ] **Step 1: Failing tests** in `schema.integration.test.ts`, where the schema facts live: `it('indexes items by list and position')`: `pragma index_list('items')` includes `items_wishlist_position`, and `pragma index_info` lists `wishlist_id`, `position` in that order. Update "adopts a database the first release created, keeping its rows and recording every migration": its expected `kysely_migration` rows gain `0003_items_wishlist_index`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `up`: `create index items_wishlist_position on items(wishlist_id, position)`; register as `'0003_items_wishlist_index'`.
- [ ] **Step 4:** Green (`assertSchemaMatches` ignores indexes).
- [ ] **Step 5:** Commit `perf: index items by list and position`.

### Task 5: Crash and not-found pages

**Files:** Create `apps/web/src/pages/ErrorPage.tsx`, `apps/web/src/pages/NotFoundPage.tsx`, `apps/web/src/pages/reloadPage.ts`; Modify `apps/web/src/App.tsx`, `apps/api/src/presentation/app.ts`; Test `apps/web/src/App.test.tsx`, `apps/api/src/presentation/routes.integration.test.ts` (7 files)

**Interfaces:** Produces `ErrorPage` (router `errorElement` on the layout route), `NotFoundPage` (`path: '*'`) and `reloadPage(): void` (`window.location.reload()` in its own module: jsdom's `location.reload` cannot be spied on, and a function in `ErrorPage`'s own module cannot be mocked for its internal call).

- [ ] **Step 1: Failing tests**:
  - API: `it('answers a missing asset with 404, not the app page')`: `GET /assets/nope.js` with `webDist` → 404. (The SPA-fallback 200 is already asserted by "sends the content and referrer policies on API responses and the SPA fallback".)
  - Web `App.test.tsx`. Each test sets up the page with `vi.doMock('./pages/HomePage', …)` before `renderApp`'s fresh import, and `vi.doMock('./pages/reloadPage', () => ({ reloadPage: reload }))` with a `vi.fn()`; `sessionStorage` is cleared after each test. The failed chunk is simulated by the page component throwing the browser's `TypeError`: `ErrorPage` sees the same `useRouteError()` value either way, while a mock factory that throws reaches the router wrapped in vitest's own "error when mocking a module" error.
    - `it('shows a reload page when a page fails to render')`: the page throws `new Error('boom')` → heading "Something went wrong." and a "Reload" button; "boom" not shown; `reload` not called.
    - `it('shows a not-found page for an unknown address')`: `/nope` → link home.
    - `it.each([['Chrome', 'Failed to fetch dynamically imported module: …/assets/HomePage-x.js'], ['Safari', 'Importing a module script failed.'], ['Firefox', 'error loading dynamically imported module: …']])('reloads once when %s cannot load a page's code')`: `reload` called once and the guard is set in `sessionStorage`.
    - `it('shows the reload page instead of reloading a second time in the same tab')`: guard already set → ErrorPage, `reload` not called.
    - `it('does not reload when session storage is unavailable')`: `vi.spyOn(Storage.prototype, 'getItem')` and `'setItem'` throw → ErrorPage, `reload` not called.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: `app.ts` not-found handler sends 404 for `request.url.startsWith('/assets/')`. `ErrorPage` uses `useRouteError()`; a chunk failure is an `Error` whose message matches `/dynamically imported module|Importing a module script failed/` (one-line why-comment: Chrome, Firefox and Safari word it differently). On a chunk failure with `sessionStorage['gubbins:chunk-reload']` unset (try/catch; on throw, don't reload), set it and call `reloadPage()`; otherwise render the frame. `ErrorPage` renders its own header/footer (the layout's `Outlet` is not there when the layout errors). Copy per spec.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `feat: reload and not-found pages replace the router's crash screen`.

### Task 6: Offline fails fast, 7 s timeout

**Files:** Create `apps/web/src/api/queryClient.ts`, `apps/web/src/api/queryClient.test.ts`; Modify `apps/web/src/main.tsx`, `apps/web/src/api/client.ts`, `apps/web/src/features/holds/useListView.ts`, `apps/web/src/features/holds/useHoldItem.ts`; Test `apps/web/src/api/client.test.ts`, `useListView.test.tsx`, `useHoldItem.test.tsx`, `apps/web/src/pages/ListPage.test.tsx` (10 files)

**Interfaces:** Produces `queryClient` (exported `QueryClient`, `staleTime: 30_000` kept, `networkMode: 'always'` for queries and mutations); `REQUEST_TIMEOUT_MS = 7_000` in `client.ts`.

- [ ] **Step 1: Failing tests**: `queryClient.test.ts` `it('fails a mutation at once when the browser says it is offline')` (`onlineManager.setOnline(false)`, mutation whose fn rejects with `ApiError(0, …)` → settles as error, not paused); `client.test.ts` `it('gives up on a request after 7 seconds')` (`vi.useFakeTimers()`, MSW handler returning `new Promise(() => {})`, `await vi.advanceTimersByTimeAsync(6_999)` → still pending, then `advanceTimersByTimeAsync(1)` → rejects with `ApiError` status 0; restore real timers after); `useListView.test.tsx` `it('does not retry a request that got no answer')`; `useHoldItem.test.tsx` `it('reports a request that got no answer without waiting for the refetch')`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** in `client.ts`'s `fetch` option: a `new AbortController()` per request, `setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)`, `globalThis.fetch(new Request(request, { signal: controller.signal }))`, and the timer cleared once the fetch settles (headers arrived or failed). The existing `.catch` maps the abort to status 0. Not `AbortSignal.timeout`: it runs on Node's internal timers, which fake timers do not drive (checked: under fake timers the test waited the full timeout). The timer stops at the headers because an abort during openapi-fetch's body read rejects outside this `.catch` as a raw `AbortError` (checked), and the spec's timeout is about a request that gets no answer. No caller passes its own signal, so there is nothing to merge. `main.tsx` imports `queryClient`. `useListView` retry: no retry for status 0 (a 5xx still gets one). `useHoldItem` `onSettled`: don't return the refetch after a network failure, so the error shows at once.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: offline and unanswered requests fail instead of hanging`.

### Task 7: Shared error text in `lib/`

**Files:** Move `apps/web/src/features/manage/actionErrorMessage.ts` → `apps/web/src/lib/actionErrorMessage.ts` and its test; Modify `packages/shared-types/src/errorResponse.ts`, `apps/api/src/presentation/app.ts`, `apps/web/src/api/client.ts`, and imports in `AddItemForm.tsx`, `EditItemForm.tsx`, `EditListDetailsForm.tsx`, `ManageItems.tsx` (9 files; `index.ts` already re-exports `errorResponse.js`)

**Interfaces:** Produces `actionErrorMessage(error: Error, couldnt: string): string` in `lib/`, following the spec's error-text table in order, and `ourEndMessage(couldnt: string): string` (the 5xx text, which the key screen also needs). `INVALID_REQUEST_MESSAGE = 'Invalid request'` exported from `@gubbins/shared-types` beside `errorResponseSchema`; `app.ts`'s three 400 replies use it. `NO_SERVER_MESSAGE = 'Request failed'` exported from `client.ts`, used by `unwrap` for an error body with no message.

- [ ] **Step 1: Failing tests** added to the moved test: `it('tells the guest to reload on a 404')` → `` `${couldnt} Reload the page to see the list as it is now.` ``; `it.each([['malformed-request 400', new ApiError(400, INVALID_REQUEST_MESSAGE)], ["proxy's 429 page with no message", new ApiError(429, NO_SERVER_MESSAGE)]])('treats a %s as our fault')` → the "our end" text; existing cases kept.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** the rules, comparing against the two constants, never a copied literal. Owner forms are unaffected by the 404 rule (they handle 404 first); check their tests.
- [ ] **Step 4:** Web suite green; `eslint-feature-boundary.test.ts` passes (`lib/` importable from features).
- [ ] **Step 5:** Commit `refactor: error text for failed actions lives in lib for guests and owners`.

### Task 8: Key screen errors and "Opening…"

**Files:** Modify `apps/web/src/features/guest-key/GuestKeyGate.tsx`, `apps/web/src/features/guest-key/useEnterGuestKey.ts`, `apps/web/src/pages/ListPage.tsx`; Test `apps/web/src/features/guest-key/GuestKeyGate.test.tsx`

**Interfaces:** Consumes `actionErrorMessage`, `ourEndMessage`, `isNetworkFailure`. Produces `useEnterGuestKey(slug: string, onEntered: () => Promise<unknown>)` — `mutationFn` awaits the POST then `onEntered()`, so `isPending` covers the list load. `GuestKeyGateProps.onSuccess: () => Promise<unknown>`.

- [ ] **Step 1: Failing tests** in `GuestKeyGate.test.tsx`:
  - Rewrite "shows the same generic not-found message on a wrong key as on any other failure" as `it('says the list could not be found when the key is refused')` (404 → "This list could not be found.").
  - `it.each([[0, 'offline'], [429, 'our end'], [500, 'our end'], [502, 'our end']])('asks the guest to try again when checking fails with %i')` → "Couldn't check the key." with the offline text for 0 and the our-end text otherwise (a 429 is the row that would leak a server or proxy message).
  - `it('keeps the button busy until the list has loaded')` ("Opening…" disabled while `onSuccess`'s promise is pending).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: a 404 gives "This list could not be found."; `isNetworkFailure(error)` gives `actionErrorMessage(error, "Couldn't check the key.")`; anything else gives `ourEndMessage("Couldn't check the key.")`, whatever the server said. `ListPage` passes `() => query.refetch()`. Button label: "Checking…" while posting, "Opening…" while `onEntered` runs.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: the key screen blames the key only when the list was not found`.

### Task 9: Sign in from the link fragment

**Files:** Create `apps/web/src/features/guest-key/fragmentKey.ts`, `apps/web/src/features/guest-key/fragmentKey.test.ts`; Modify `GuestKeyGate.tsx`, `ListPage.tsx`; Test `GuestKeyGate.test.tsx`, `apps/web/src/pages/ListPage.test.tsx` (6 files)

**Interfaces:** Produces `readFragmentKey(hash: string): { key: string | null; rest: string }`, pure: reads `key` from the hash via `URLSearchParams`; `key` is null when missing, empty or undecodable (`URLSearchParams` never throws: `%E0` decodes to U+FFFD, so a value containing U+FFFD counts as undecodable); `rest` is the hash without the `key` parameter (`''` when nothing else is left). `GuestKeyGateProps.initialKey?: string`, `autoSubmit?: boolean`.

- [ ] **Step 1: Failing tests**:
  - `fragmentKey.test.ts`: `it.each` with named rows: `#key=maple-lantern-otter` → key, rest `''`; `#key=maple-lantern-otter&foo=bar` → key, rest `#foo=bar`; `''`, `#key=`, `#key=%E0` → no key, rest `''`; `#foo=bar` → no key, rest `#foo=bar`.
  - `GuestKeyGate.test.tsx`: `it('submits the link's key once, even when mounted twice in strict mode')` (`<StrictMode>`, one session POST).
  - `ListPage.test.tsx` (the fragment goes in `MemoryRouter`'s `initialEntries`, e.g. `/abc123#key=maple-lantern-otter`): `it('opens the list from the invite link without asking for the key')` (list 404 then session 200 then list 200 → items shown, key screen never shown; the router's location no longer has the key); `it('ignores the link's key when the guest is already in')` (list 200 → no session POST); `it('shows the key screen with the link's key filled in when it is refused')` (session 404 → input value is the key, "This list could not be found."); `it('keeps the link's key for a retry when the server cannot be reached')` (session → network error → input prefilled, offline text).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: `ListPage` reads the hash from `useLocation()` once (state initialiser) and, when it held a key, replaces the entry with `navigate({ pathname, search, hash: rest }, { replace: true })`, so the router's location stays in step with the address bar (a bare `history.replaceState` would leave `useLocation().hash` stale). It passes the key as `initialKey` with `autoSubmit` to the gate. The gate auto-submits once on mount when `autoSubmit`, guarded by a `useRef` so `StrictMode`'s double effect does not post twice, and while that first attempt is pending renders the list page's "Loading…" view instead of the form.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `feat: guests open a list straight from the invite link`.

### Task 10a: One invite link — card and unit tests

**Files:** Modify `apps/web/src/lib/InvitationCard.tsx`, `apps/web/src/lib/links.ts`; Test `apps/web/src/lib/InvitationCard.test.tsx`, `apps/web/src/features/create-list/CreateListForm.test.tsx`, `apps/web/src/features/manage/ListDetails.test.tsx` (5 files)

**Interfaces:** Produces `invitePath(slug: string, guestKey: string): string` → `` `${listPath(slug)}#key=${encodeURIComponent(guestKey)}` ``. `InvitationCardProps` unchanged.

- [ ] **Step 1: Failing tests** (rewrite the existing tests that read the key line; no asserts that the removed key line or button is gone):
  - `InvitationCard.test.tsx`: rewrite "Copy key copies the key and Copy link copies the full guest link" as `it('Copy link copies the guest link with the key in its fragment')`: the link's href and the copied text end with `#key=maple-lantern-otter`.
  - `CreateListForm.test.tsx`: "shows the guest link, guest key, and owner token after a successful submit", "sends the suggested key with the list and shows it on the ready screen" and "replaces the key when Regenerate is pressed, and sends the new one" read the key from its text or `data-testid="guest-key"`; read it from the guest link's href instead, and drop "guest key" from the first title.
  - `ListDetails.test.tsx`: "shows the title, description, key and guest link" becomes "shows the title, description and guest link", asserting the link carries the key.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement** per spec (heading copy suited to one link).
- [ ] **Step 4:** Web suite and the verify script (no `--e2e`: this PR does not target `main`) green. e2e is red here until 10b; the PR description says so.
- [ ] **Step 5:** Commit `feat: the invite is one link with the key in it`.

### Task 10b: One invite link — e2e specs

**Files:** e2e `e2e/guest-holds-several.spec.ts`, `e2e/guest-manages-a-hold.spec.ts`, `e2e/guest-pledges.spec.ts`, `e2e/owner-adds-items.spec.ts`, `e2e/owner-edits-a-list.spec.ts`, `e2e/owner-reorders-gifts.spec.ts` (6 files). Base: Task 10a.

- [ ] **Step 1:** The specs take `guestLink` (with fragment) and `goto` it instead of filling the key; **keep one** spec (`guest-manages-a-hold`) typing the key on the bare path so the fallback stays covered.
- [ ] **Step 2:** The verify script with `--e2e` green on top of 10a.
- [ ] **Step 3:** Commit `test: e2e guests open the list from the invite link`. Open together with 10a.

### Task 11: Guest error text — hold and purchase

**Files:** Modify `apps/web/src/features/holds/HoldDialog.tsx`, `PurchaseDialog.tsx`, `HoldActions.tsx`; Test `HoldDialog.test.tsx`, `PurchaseDialog.test.tsx`, `YourContributions.test.tsx`

**Interfaces:** Consumes `actionErrorMessage`. `HoldActions`' local `failureMessage` is replaced by it.

- [ ] **Step 1: Failing tests** (one per screen proves the routing; the text rules themselves are `actionErrorMessage`'s tests): HoldDialog 500 → "Couldn't hold ‹title›. Something went wrong on our end…"; PurchaseDialog 500 → the "our end" text with its lead-in; in `YourContributions.test.tsx`, update the expected text of "explains a not-found hold in words a guest can act on, not the bare "Not found"" (extend 404) to the new "…Reload the page to see the list as it is now." copy. No separate release-404 test: same rule, another button.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**; lead-ins short, per screen (spec leaves wording to builder). Existing `tooFew`/`recapped` notes stay first.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: hold and purchase errors tell guests what to do`.

### Task 12: Guest error text — chip-in and list page

**Files:** Modify `apps/web/src/features/contribute/ContributeDialog.tsx`, `apps/web/src/pages/ListPage.tsx`; Test `ContributeDialog.test.tsx`, `ListPage.test.tsx`

- [ ] **Step 1: Failing tests**: ContributeDialog 500 → "our end" text. In `ListPage.test.tsx`, change the rows of the existing `it.each` "shows the error, not the guest key, when the first load %s": "cannot reach the server" expects "Couldn't load the list. You seem to be offline…", "gets a 503" expects "Couldn't load the list. Something went wrong on our end…". ListPage 404 still shows the key screen (existing test kept).
- [ ] **Step 2–4:** FAIL → implement → green. In `ContributeDialog`'s `onSettled`, after a status-0 failure, start the refetch but don't await it.
- [ ] **Step 5:** Commit `fix: chip-in and list errors tell guests what to do`.

### Task 13: Already-worked retries; purchase sheet keeps the message

**Files:** Modify `apps/web/src/features/holds/HoldActions.tsx` (and `PurchaseDialog.tsx` if the keep-open rule lives there); Test `YourContributions.test.tsx` (the purchase-sheet tests live there)

**Interfaces:** None new.

- [ ] **Step 1: Failing tests** in `YourContributions.test.tsx`:
  - `it('reports an extension that already went through as extended')`: extend → 409 `hold_already_extended`, refetch shows extended → normal extended outcome.
  - `it.each([['409 hold_not_active', …], ['404', …]])('reports a release that already went through as released after a %s')`: refetch without the hold → released outcome.
  - `it('reports a purchase the server already has as purchased')`: purchase → 409 `hold_not_active`, refetch shows `purchased` → success message.
  - `it.each([['network failure', …], ['server error', 500], ['proxy error with no message', 502], ['clash with no code', 409], ['refusal as unavailable', 409 item_unavailable]])('keeps the purchase sheet and the typed message after a %s')`: sheet open, message box still holds the typed text. It replaces "keeps the purchase sheet open after a network failure, so a second tap can buy it" and "keeps the typed message when the purchase is refused as unavailable".
  - A timed-out purchase that went through is already covered by "thanks the guest when the refetch after a network failure shows the purchase went through"; no new test.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: on those codes, await the list refetch and decide from the refetched hold; in `useHoldAction`'s `onError`, after a status-0 failure, start the refetch but don't await it; sheet `onError` keeps open for status 0, ≥ 500, non-`ApiError`, code-less 409 and `item_unavailable`.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `fix: a hold action that already worked is reported as done`.

### Task 14: Chip-in draft survives Venmo

**Files:** Create `apps/web/src/features/contribute/contributeDraft.ts`, `contributeDraft.test.ts`; Modify `ContributeDialog.tsx`, `apps/web/src/features/holds/ItemView.tsx`, `apps/web/src/pages/ListPage.tsx`; Test `ContributeDialog.test.tsx`, `ListPage.test.tsx` (7 files)

**Interfaces:** Produces
```ts
interface ContributeDraft { itemId: string; amountText: string; message: string; idempotencyKey: string; savedAt: number }
loadDraft(slug: string, now: number): ContributeDraft | null   // null and removes it when older than 24 h
saveDraft(slug: string, draft: ContributeDraft): void
clearDraft(slug: string): void
```
Storage key `gubbins:contribute-draft:${slug}` in `localStorage`; every access in try/catch. The draft is saved only on the `pay` step, the one that links to Venmo or Zelle: on the `amount` step the dialog holds `coverRest`/`other` and `amountText` is set only on "Continue", so there is nothing to restore there. A restored draft always opens on `pay`, so no step is stored. `ListPage` loads the draft and passes it to the matching `ItemView` (`draft?: ContributeDraft`), which opens its `ContributeDialog` (it owns `chipInOpen`) with `draft`.

- [ ] **Step 1: Failing tests**:
  - `contributeDraft.test.ts`: round-trips; `it('forgets a draft saved more than 24 hours ago')` (`loadDraft` at `savedAt + 24h + 1ms` → null and key removed); storage that throws → null / no-op.
  - `ListPage.test.tsx`: `it('reopens a chip-in the guest left for Venmo')` (draft present → dialog open on the pay step with amount and message); `it.each(['deleted', 'fully funded'])('drops a draft for a gift that is %s')` → no dialog, key removed.
  - `ContributeDialog.test.tsx`: `it('sends the saved pledge key so a pledge already made is not doubled')`; `it('clears the draft on cancel')`; `it('clears the draft once the pledge is recorded')`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement**: on the `pay` step the dialog saves on each change of amount or message; it takes an optional `draft` prop to start from (on `pay`); the list page loads the draft once per mount and hands it to the matching item if it is still open for contributions.
- [ ] **Step 4:** Green.
- [ ] **Step 5:** Commit `feat: a chip-in in progress survives leaving for the payment app`.

### Task 15: Deploy doc

**Files:** Modify `docs/deploy.md`

- [ ] Replace the "Until go-live … `down -v`" paragraph per spec: upgrade is `up -d --build`; migrations run at start-up; never `down -v` on production; stop the server before running `migrate` or `rebuild-projections` against the live database.
- [ ] Commit `docs: upgrading never deletes the production database`.
