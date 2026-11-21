# Manage page redesign: gift rows and who gave what — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The manage page shows each gift's description and always-on counts, and a list-wide "Show who gave what" reveals who bought, held or pledged, loaded on demand.

**Architecture:** The `Item` aggregate gains two hold queries that both the counts and the details use. The manage view gains `purchasedUnits`. A new owner-only use case and route (`GET /api/lists/:slug/gift-details`) return names and messages, read from `guest_pii` in one batch. The web app fetches them only after the owner presses the button, under a query key nested in the manage view's, so they refresh with it.

**Tech Stack:** TypeScript, Fastify + zod (shared-types), Kysely/SQLite, React + TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-manage-redesign-design.md` (mockup `docs/design/manage-redesign-mockup.html`, ADR-0089).

## Global Constraints

- One task = one PR, at most 10 changed files, generated files and tests included. Each PR stacks on the previous one and passes `scripts/verify.sh` on its own; the last one runs `--e2e`.
- One route or API contract change per PR (Tasks 2 and 5).
- Domain instants are `at`, never `now`. Use cases load the aggregate as of `clock.now()`.
- Not the owner reads as no list: `WishlistNotFoundError` → generic 404 (ADR-0016).
- Names and messages never appear in the manage view, and the web app requests them only after "Show who gave what" (ADR-0089).
- The gift-details response carries `Cache-Control: no-store`.
- Copy, exactly: "Who gave what is hidden." / "Showing who gave what." / "Show who gave what" / "Hide" / "Showing…" / "Spoilers: this shows every guest's name and message, for all gifts." / "No one has held, bought or pledged yet." / kind labels "Bought", "Held", "Pledged" / count line "N of Q bought" plus " · M held" only when M > 0.
- Rows within each kind sort oldest first: purchases by `purchasedAt`, holds by `expiresAt`, pledges by `pledgedAt`. Bought units are the hold's `purchasedUnits`, not `units`.
- Dates are the owner's local month and day ("Nov 12"), with the year when it isn't the current year.
- No test name, comment or commit mentions this plan, task numbers or branch names.
- The drag handle, the "⋯" menu and its move pill are **not** in this plan; they ship with drag-and-drop (roadmap item 4). Rows keep today's buttons. The pledge method line is roadmap item 3a.

## Review Focus

1. **Names before the reveal.** Opening the manage page must make no gift-details request at all. Pinned in Task 7 (`makes no gift-details request until the owner presses Show who gave what`).
2. **A part-bought hold.** A guest who held 2 and bought 1 is listed with 1 unit bought, and the unit they gave back is neither bought nor held. Pinned in Task 4 (`lists a part-bought hold with the units bought, not the units held`).
3. **Hidden is not remembered.** Hide, then Show, must fetch again rather than show a cached copy, and a page reload starts hidden. Pinned in Task 7 (`fetches afresh when the owner shows the details again after hiding them`).
4. **A guest's message is text.** A message like `<b>hi</b>` or `*hi*` must show literally, not as markup. Pinned in Task 6 (`shows a message as plain text, not markup`).
5. **The session ends mid-reveal.** A 404 from gift-details sends the owner back to the token gate like every other owner request. Pinned in Task 7 (`sends the owner back to the token gate when the details answer 404`).

---

### Task 1: `Item` active and purchased holds

**Files:**
- Modify: `apps/api/src/domain/entities/Item.ts` (the counts at ~165–172 and `unitsOfHoldsThatAre` at ~409)
- Test: `apps/api/src/domain/entities/Item.test.ts` (the "Item availability and holds" describe)

**Interfaces:**
- Produces: `Item.activeHolds(): readonly Hold[]` and `Item.purchasedHolds(): readonly Hold[]`, as of the item's `asOf`, in load order. `purchasedCount()` and `committedUnits()` are rewritten on them; `unitsOfHoldsThatAre` goes.

- [ ] **Step 1: Write the failing tests**

```ts
it('lists only its active holds, not released, expired, purchased or undone ones', () => {
  const active = holdOn();
  const item = Item.reconstitute({ ...base, quantity: 5, holds: [
    active, holdOn({ releasedAt: T0 }), holdOn({ expiresAt: new Date(T0.getTime() - 1) }),
    holdOn({ purchasedAt: T0, purchasedUnits: 1 }), holdOn({ purchasedAt: T0, purchasedUnits: 1, buyUndoneAt: T0 }),
  ] });
  expect(item.activeHolds().map((h) => h.id.value)).toEqual([active.id.value]);
});

it('lists only its purchased holds, not active, released or undone ones', () => {
  const bought = holdOn({ purchasedAt: T0, purchasedUnits: 1 });
  const item = Item.reconstitute({ ...base, quantity: 5, holds: [
    holdOn(), holdOn({ releasedAt: T0 }), bought, holdOn({ purchasedAt: T0, purchasedUnits: 1, buyUndoneAt: T0 }),
  ] });
  expect(item.purchasedHolds().map((h) => h.id.value)).toEqual([bought.id.value]);
});
```

Protects: the status filter each query applies. The existing count tests ("counts its purchased holds…", "counts active and purchased holds as committed…") stay and now pin the rewrite.

- [ ] **Step 2: Run them to see them fail**

Run: `scripts/verify.sh --quick apps/api src/domain/entities/Item.test.ts`
Expected: FAIL, `activeHolds is not a function`.

- [ ] **Step 3: Implement the two queries** in `Item.ts`, filtering `_holds` by `hold.statusAt(this.asOf)`; rewrite `purchasedCount()` as the sum of `purchasedUnits ?? 0` over `purchasedHolds()` and `committedUnits()` as the sum of `units` over `activeHolds()` plus `purchasedCount()`; delete `unitsOfHoldsThatAre`. Doc comment on each query: what the count line and the owner's details both read, so they can't disagree.

- [ ] **Step 4: Run the file again**

Run: `scripts/verify.sh --quick apps/api src/domain/entities/Item.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit** — `feat(api): an item lists its active and its purchased holds`

---

### Task 2: The manage view says how many units were bought

**Files:**
- Modify: `apps/api/src/application/use-cases/GetManageView.ts`
- Test: `apps/api/src/application/use-cases/GetManageView.test.ts`
- Modify: `packages/shared-types/src/manageView.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (`npm run gen:api`)
- Modify fixtures: `apps/web/src/features/manage/ManageItems.test.tsx`, `apps/web/src/features/manage/EditItemForm.test.tsx`, `apps/web/src/pages/ManagePage.test.tsx` (add `purchasedUnits: 0`)

8 files.

**Interfaces:**
- Consumes: `Item.purchasedCount()`.
- Produces: `manageItemSchema.purchasedUnits: z.number().int().nonnegative()`, doc comment "Units bought; committedUnits minus this is what active holds take." `ManageView.items[].purchasedUnits: number`.

- [ ] **Step 1: Update the use case's success test.** In "shows the owner the list, its style, its key and each item with what editing needs", buy one unit of a quantity-2 item in `setup()` (`withItem({ …, quantity: 2 })`, then `BuyItem` with `units: 1`) and expect `purchasedUnits: 1, committedUnits: 2` on it and `purchasedUnits: 0` on the others. Protects: the field's mapping from `purchasedCount()`.
- [ ] **Step 2: Run it to see it fail** — `scripts/verify.sh --quick apps/api src/application/use-cases/GetManageView.test.ts`; FAIL on the missing field.
- [ ] **Step 3: Add the field** to `ManageView`, the use case's mapping and `manageItemSchema`; run `npm run gen:api`; add `purchasedUnits: 0` to the three web fixtures.
- [ ] **Step 4: Verify** — `scripts/verify.sh` passes (the route's existing manage test covers the wiring; no new route test).
- [ ] **Step 5: Commit** — `feat(api): the manage view counts each gift's bought units`

---

### Task 3: Gift rows show the description and what's still needed

**Files:**
- Create: `apps/web/src/lib/PledgeProgress.tsx`
- Create: `apps/web/src/lib/PledgeProgress.test.tsx` (tests moved from `ItemView.test.tsx`)
- Modify: `apps/web/src/features/holds/ItemView.tsx` (~89–123), `apps/web/src/features/holds/ItemView.test.tsx`
- Modify: `apps/web/src/features/manage/ManageItems.tsx`, `apps/web/src/features/manage/ManageItems.test.tsx`

6 files.

**Interfaces:**
- Consumes: `ManageViewResponse['items'][number].purchasedUnits`.
- Produces: `PledgeProgress({ pledgedMinor: number; priceMinor: number })`: the sr-only `<progress>`, the "$X of $Y pledged · N%" line and the coin bar, moved unchanged from `ItemView` (its floor comment comes with it).

- [ ] **Step 1: Move the progress tests.** Cut from `ItemView.test.tsx` the five progress tests ("fills the bar to 100%, not 150%…", "hides the coin bar from screen readers…", "hides the progress bar visually…", the `it.each` "shows a group gift pledged %i toward its price as progress", "shows 99%, not 100%…") into `PledgeProgress.test.tsx`, rendering `<PledgeProgress pledgedMinor={…} priceMinor={…} />` directly with the same values and assertions. Keep one test in `ItemView.test.tsx` that a group gift renders the progress line (`'$100.00 of $450.00 pledged · 22%'`), so the wiring stays pinned.
- [ ] **Step 2: Write the manage row tests** in `ManageItems.test.tsx`:

```ts
it("shows a gift's description, clamped like the guest page", () => {
  renderItems([item({ description: 'Stainless, *please*.' })]);
  expect(screen.getByText('please', { selector: 'em' })).toBeInTheDocument();
});

it.each([
  [{ quantity: 3, committedUnits: 2, purchasedUnits: 1 }, '1 of 3 bought · 1 held'],
  [{ quantity: 1, committedUnits: 0, purchasedUnits: 0 }, '0 of 1 bought'],
])('counts what guests have done to a single gift as %o', (over, text) => {
  renderItems([item(over)]);
  expect(screen.getByText(text)).toBeInTheDocument();
});

it("shows a group gift's pledges as progress toward its target", () => {
  renderItems([item({ type: 'group', priceMinor: 18_000, pledgedMinor: 10_000, quantity: 1 })]);
  expect(screen.getByText('$100.00 of $180.00 pledged · 55%')).toBeInTheDocument();
});
```

Protects: the description render, the held arithmetic and its "only when > 0" branch, and the group wiring. `renderItems` and `item` are the file's existing helpers.

- [ ] **Step 3: Run both files to see the new tests fail** — `scripts/verify.sh --quick apps/web src/lib/PledgeProgress.test.tsx src/features/manage/ManageItems.test.tsx`.
- [ ] **Step 4: Implement.** Extract `PledgeProgress`; `ItemView` renders it. In `ManageItems` rows, under the price line: the description as `<ClampedText id={`manage-description-${item.id}`}><Markdown text={item.description} /></ClampedText>` (no `rememberAs`), then the count line — single: `<p><b>{purchasedUnits} of {quantity}</b> bought{held > 0 && ` · ${held} held`}</p>` with `held = committedUnits − purchasedUnits`; group: `<PledgeProgress>`.
- [ ] **Step 5: Verify** — `scripts/verify.sh` passes.
- [ ] **Step 6: Commit** — `feat(web): the manage page shows each gift's description and what's still needed`

---

### Task 4: Owner-only gift details, with names read in one batch

**Files:**
- Modify: `apps/api/src/application/ports/GuestPiiRepository.ts`
- Modify: `apps/api/src/application/ports/contracts/guestPiiRepository.contract.ts`
- Modify: `apps/api/src/infrastructure/GuestPiiRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts` (`InMemoryGuestPiiRepository`)
- Create: `apps/api/src/application/use-cases/GetGiftDetails.ts`
- Create: `apps/api/src/application/use-cases/GetGiftDetails.test.ts`

6 files. The use case has no caller until Task 5 (the route); folding it in would take that PR past 10 files.

**Interfaces:**
- Consumes: `Item.activeHolds()`, `Item.purchasedHolds()`, `Item.contributions`, `Hold.piiRef | purchasedAt | purchasedUnits | units | expiresAt`, `Contribution.piiRef | amount.amountMinor | pledgedAt`.
- Produces:
  - `GuestPiiRepository.findByIds(ids: readonly string[]): Promise<Map<string, GuestDetails>>`: one query; unknown ids are absent; an empty list returns an empty map without querying.
  - `class GetGiftDetails { constructor(unitOfWork: UnitOfWork, clock: Clock); execute(input: { wishlistId: string }, access: AccessContext): Promise<GiftDetails> }`
  - ```ts
    export interface GiftDetails {
      items: {
        itemId: string;
        purchases: { name: string; message: string | null; units: number; purchasedAt: Date }[];
        holds: { name: string; units: number; expiresAt: Date }[];
        pledges: { name: string; message: string | null; amountMinor: number; pledgedAt: Date }[];
      }[];
    }
    ```
    Every item, in list order, with empty arrays when nothing happened.

- [ ] **Step 1: Write the contract tests** in `describeGuestPiiRepositoryContract`:

```ts
it('reads several rows by id in one call, leaving out unknown ids', async () => {
  const ada = GuestDetails.from({ name: 'Ada', message: 'Hello' });
  const grace = GuestDetails.from({ name: 'Grace' });
  await fx.guestPii.insert('pii-1', ada);
  await fx.guestPii.insert('pii-2', grace);
  expect(await fx.guestPii.findByIds(['pii-1', 'pii-2', 'missing'])).toEqual(new Map([['pii-1', ada], ['pii-2', grace]]));
});

it('reads nothing for no ids', async () => {
  expect(await fx.guestPii.findByIds([])).toEqual(new Map());
});
```

Protects: the adapter's `where id in` and its empty-list guard (Kysely refuses an empty `in`).

- [ ] **Step 2: Write the use case tests** in `GetGiftDetails.test.ts`, with the same in-memory setup style as `GetManageView.test.ts` (`FixedClock(T0)`, `HoldItem`, `BuyItem`, `MarkHoldPurchased`, `PledgeContribution`):

```ts
it('shows the owner who bought, holds and pledged each gift, with their messages, oldest first', …)
// A single gift (quantity 3): Ada buys 1 with message 'Happy 30th!'; Grace holds 1. A group gift: Sam pledges 2_500 with
// message 'From all of us', then Jo pledges 4_000 a minute later. An untouched gift.
// expect toEqual the whole GiftDetails: the single gift's purchases [{ name: 'Ada', message: 'Happy 30th!', units: 1, purchasedAt: T0 }],
// holds [{ name: 'Grace', units: 1, expiresAt: T0 + 3 days }]; the group's pledges Sam then Jo; the untouched gift's three empty lists.

it('lists a part-bought hold with the units bought, not the units held', …)
// Ada holds 2 of 3 and marks 1 purchased: purchases [{ …, units: 1 }], holds [].

it('treats a caller who is not the owner as no list', …)  // rejects with WishlistNotFoundError

it('refuses a hold whose guest details are missing', …)
// Put a reconstituted hold with piiRef null into the in-memory store, then expect execute to reject with an Error naming the hold id.
```

Protects, in order: the mapping and sort; `purchasedUnits` over `units`; the owner check; the missing-details guard. Released, expired and undone holds are not re-tested here: Task 1's queries own that.

- [ ] **Step 3: Run both to see them fail** — `scripts/verify.sh --quick apps/api src/application/test-fakes/InMemoryRepositories.contract.test.ts src/application/use-cases/GetGiftDetails.test.ts`. (The Kysely adapter runs the same contract in `verify.sh`'s integration tests.)
- [ ] **Step 4: Implement** `findByIds` in the port, the Kysely adapter (`selectFrom('guest_pii').select(['id','name','message']).where('id','in',ids)`, after an early return for `[]`) and the fake (copy on read, like `findById`). Then `GetGiftDetails`: owner check as in `GetManageView`; one `ctx.wishlists.findById(id, this.clock.now())`; collect every `piiRef` from `purchasedHolds()`, `activeHolds()` and `contributions`; one `ctx.guestPii.findByIds`; map, sorting each list by its instant. A null `piiRef` or an id missing from the map throws `new Error(\`guest details missing for hold ${hold.id.value}\`)` — why-comment: every hold has stored a name since before the first release, so this is corrupt data, not a case to show.
- [ ] **Step 5: Verify** — `scripts/verify.sh` passes.
- [ ] **Step 6: Commit** — `feat(api): the owner's gift details, with names read in one batch`

---

### Task 5: `GET /api/lists/:slug/gift-details`

**Files:**
- Create: `packages/shared-types/src/giftDetails.ts`; Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/api/src/presentation/routes.ts`, `apps/api/src/presentation/compositionRoot.ts`, `apps/api/src/presentation/openApiDocument.ts`
- Test: `apps/api/src/presentation/routes.integration.test.ts`, `apps/api/src/presentation/openApiDocument.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

9 files.

**Interfaces:**
- Consumes: `GetGiftDetails` (Task 4).
- Produces: `giftDetailsResponseSchema` and `type GiftDetailsResponse`: the `GiftDetails` shape with every instant as an ISO string (`z.string()`); operationId `getGiftDetails`; responses 200 / 400 / 404 like `getManageView`. 200's description: "Who bought, holds and pledged each gift, with their names and messages." `deps.getGiftDetails: GetGiftDetails`.

- [ ] **Step 1: Write the route tests** in a new `describe('GET /api/lists/:slug/gift-details')`, next to the manage view's:

```ts
it("shows the owner a guest's purchase with their name and message, and isn't cached", …)
// createList, the guest buys the gift with name 'Ada' and message 'Congratulations!' through POST …/buy,
// then GET as the owner: 200, header cache-control 'no-store',
// json toMatchObject({ items: [{ itemId: list.itemId, purchases: [{ name: 'Ada', message: 'Congratulations!', units: 1 }] }] }).

it('answers a guest session without the owner cookie with the generic 404', …)
// same shape as the manage view's test.
```

Add `getGiftDetails: ['200', '400', '404']` to the status table in `openApiDocument.test.ts`.

- [ ] **Step 2: Run them to see them fail** — `scripts/verify.sh --quick apps/api src/presentation/routes.integration.test.ts src/presentation/openApiDocument.test.ts`.
- [ ] **Step 3: Implement** the schema, the route (a copy of the manage view route's owner handling, `reply.header('Cache-Control', 'no-store')`, `toISOString()` on each instant), the composition root entry and the `unusedDependency('getGiftDetails')` stub; run `npm run gen:api`.
- [ ] **Step 4: Verify** — `scripts/verify.sh` passes.
- [ ] **Step 5: Commit** — `feat(api): owner route for who gave what`

---

### Task 6: The details card under each gift

**Files:**
- Create: `apps/web/src/lib/formatDay.ts`, `apps/web/src/lib/formatDay.test.ts`
- Create: `apps/web/src/features/manage/GiftDetailsCard.tsx`, `apps/web/src/features/manage/GiftDetailsCard.test.tsx`
- Modify: `apps/web/src/features/manage/ManageItems.tsx`, `apps/web/src/features/manage/ManageItems.test.tsx`

6 files. `ManageItems`' new prop has no caller until Task 7.

**Interfaces:**
- Consumes: `GiftDetailsResponse` (Task 5).
- Produces:
  - `formatDay(iso: string, at: Date): string` — "Nov 12" when the year matches `at`'s, else "Nov 12, 2025" (`Intl.DateTimeFormat(undefined, …)`, owner's local time).
  - `GiftDetailsCard({ details: GiftDetailsResponse['items'][number]; type: 'single' | 'group' })`.
  - `ManageItemsProps.details?: GiftDetailsResponse['items']` — when given, each row renders its card (found by `itemId`) at the end of the row.

- [ ] **Step 1: Write the tests.**

`formatDay.test.ts` (explicit UTC instants; the test environment's locale is en-US):

```ts
it('shows the month and day for a date this year', () => {
  expect(formatDay('2026-11-12T15:00:00.000Z', new Date('2026-11-21T12:00:00.000Z'))).toBe('Nov 12');
});
it('adds the year for a date in another year', () => {
  expect(formatDay('2025-12-30T15:00:00.000Z', new Date('2026-01-02T12:00:00.000Z'))).toBe('Dec 30, 2025');
});
```

`GiftDetailsCard.test.tsx`:

```ts
it('lists who bought a single gift with their message, and who holds it until when', …)
// purchases [{ name: 'Maya Chen', units: 1, message: 'Happy 30th!', purchasedAt }], holds [{ name: 'Jo', units: 2, expiresAt }]:
// headings/labels 'Bought' and 'Held'; text 'Maya Chen', 'Happy 30th!', 'Jo · 2', 'until Nov 27'; no '· 1' after Maya Chen.
it('lists who pledged to a group gift, with the amount', …)   // 'Priya Nair · $60.00'
it('says no one has acted yet when every list is empty', …)    // 'No one has held, bought or pledged yet.'
it('shows a message as plain text, not markup', …)             // message '<b>hi</b> *there*' appears verbatim; no <b> or <em> element
```

`ManageItems.test.tsx`:

```ts
it("shows each gift's card when the details are given, and none without them", …)
```

- [ ] **Step 2: Run them to see them fail** — `scripts/verify.sh --quick apps/web src/lib/formatDay.test.ts src/features/manage/GiftDetailsCard.test.tsx src/features/manage/ManageItems.test.tsx`.
- [ ] **Step 3: Implement**, following the mockup's ledger card: a kind label per non-empty group, one row per guest (name, " · N" only when N > 1, the date right-aligned, the message on its own line in italics), in Tailwind classes from the existing theme tokens. Messages render as React text, never through `Markdown`.
- [ ] **Step 4: Verify** — `scripts/verify.sh` passes.
- [ ] **Step 5: Commit** — `feat(web): the owner's details card under each gift`

---

### Task 7: "Show who gave what"

**Files:**
- Modify: `apps/web/src/api/client.ts`, `apps/web/src/api/client.test.ts`
- Create: `apps/web/src/features/manage/WhoGaveWhat.tsx`, `apps/web/src/features/manage/WhoGaveWhat.test.tsx`
- Modify: `apps/web/src/features/manage/manageViewKey.ts`
- Modify: `apps/web/src/pages/ManagePage.tsx`, `apps/web/src/pages/ManagePage.test.tsx`

7 files.

**Interfaces:**
- Consumes: `ManageItemsProps.details` (Task 6), `GiftDetailsResponse` (Task 5).
- Produces:
  - `api.getGiftDetails(slug: string): Promise<GiftDetailsResponse>`.
  - `giftDetailsKey = (slug: string) => [...manageViewKey(slug), 'gift-details'] as const` — nested so invalidating the manage view refetches shown details.
  - `WhoGaveWhat({ revealed: boolean; pending: boolean; error: Error | null; onShow(): void; onHide(): void })`: the box. Status line `<p aria-live="polite">`, the warning only while hidden, the button "Show who gave what" / "Showing…" (disabled while pending) / "Hide".
  - `ManagePage` owns `revealed` (plain `useState(false)`, never stored) and the `useQuery({ queryKey: giftDetailsKey(slug), queryFn, enabled: entered && revealed && !gone, retry: false })`; Hide sets `revealed` false and `removeQueries({ queryKey: giftDetailsKey(slug) })`. A 404 calls the page's existing `unauthorized()`.

- [ ] **Step 1: Write the tests.**

`client.test.ts`: `it("fetches the owner's gift details from the list's gift-details URL", …)` — the request URL is `/api/lists/the-slug/gift-details`.

`WhoGaveWhat.test.tsx`:

```ts
it('warns about spoilers and offers to show the details while hidden', …)
it('says the details are showing and offers Hide once revealed, without the warning', …)
it('disables the button and says Showing… while the details load', …)
it("shows why the details didn't load", …)   // error message rendered with role alert
```

`ManagePage.test.tsx` (MSW, counting gift-details requests):

```ts
it('makes no gift-details request until the owner presses Show who gave what', …)
it("shows each gift's card once the owner presses Show who gave what", …)
it('fetches afresh when the owner shows the details again after hiding them', …)   // two requests counted
it('sends the owner back to the token gate when the details answer 404', …)
```

- [ ] **Step 2: Run them to see them fail** — `scripts/verify.sh --quick apps/web src/api/client.test.ts src/features/manage/WhoGaveWhat.test.tsx src/pages/ManagePage.test.tsx`.
- [ ] **Step 3: Implement.** `ManagePage` renders `<WhoGaveWhat>` between `AddItemForm` and `ManageItems`, so it sits above the gift list as in the mockup, and passes `details={revealed ? query.data?.items : undefined}` to `ManageItems`. Focus stays on the button throughout. Error copy through `actionErrorMessage(error, 'Couldn’t show who gave what.')`.
- [ ] **Step 4: Verify** — `scripts/verify.sh` passes.
- [ ] **Step 5: Commit** — `feat(web): the owner can show and hide who gave what`

---

### Task 8: E2E — the owner reads a guest's message

**Files:**
- Create: `e2e/owner-sees-who-gave-what.spec.ts`

1 file.

- [ ] **Step 1: Write the journey**, in the style of `e2e/guest-pledges.spec.ts` (375×812 viewport): the owner creates a list and adds "Linen apron"; a guest opens the guest link and buys it with name "Maya" and message "Happy 30th!"; the owner reloads the manage page, sees "1 of 1 bought" and no "Maya"; presses "Show who gave what"; sees "Maya" and "Happy 30th!" under Linen apron; runs the axe scan (serious and critical only, ADR-0026); presses "Hide" and no longer sees "Maya".

```ts
test('the owner shows who bought a gift, reads their message, and hides it again', async ({ page, context }) => { … });
```

- [ ] **Step 2: Verify** — `scripts/verify.sh --e2e` passes. Announce the e2e run to peer sessions first (shared dev servers).
- [ ] **Step 3: Commit** — `test(e2e): the owner reads who gave what`

---

## Test list: what each test protects

| Task | Test | Production line it protects |
|---|---|---|
| 1 | lists only its active holds… | `activeHolds()`'s status filter |
| 1 | lists only its purchased holds… | `purchasedHolds()`'s status filter |
| 2 | (updated) shows the owner the list… | `purchasedUnits` mapping in `GetManageView` |
| 3 | PledgeProgress tests (moved) | `PledgeProgress` arithmetic and markup (unchanged) |
| 3 | shows a gift's description… | `ManageItems` description render |
| 3 | counts what guests have done… | the held subtraction and its `> 0` branch |
| 3 | shows a group gift's pledges… | `ManageItems` → `PledgeProgress` wiring |
| 4 | reads several rows by id… / reads nothing for no ids | adapter `in` query, empty guard |
| 4 | shows the owner who bought, holds and pledged… | use case mapping and sort |
| 4 | lists a part-bought hold… | `purchasedUnits` over `units` |
| 4 | treats a caller who is not the owner as no list | the owner check |
| 4 | refuses a hold whose guest details are missing | the missing-details guard |
| 5 | shows the owner a guest's purchase… | route wiring, ISO mapping, `no-store` |
| 5 | answers a guest session… with the generic 404 | the route's owner gate |
| 6 | formatDay (2) | the year branch |
| 6 | GiftDetailsCard (4) | rows, units-only-when-more-than-1, empty copy, plain-text message |
| 6 | shows each gift's card when the details are given… | `ManageItems`' `details` prop |
| 7 | client URL test | `getGiftDetails`' path |
| 7 | WhoGaveWhat (4) | the box's three states and its error |
| 7 | ManagePage (4) | `enabled` gate, card wiring, `removeQueries` on Hide, 404 → gate |
| 8 | the owner shows who bought a gift… | the whole journey, plus axe |
