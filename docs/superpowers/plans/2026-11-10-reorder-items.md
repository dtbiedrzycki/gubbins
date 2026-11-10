# Owner puts gifts in order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the manage page, the list owner can move each gift up, down, to the top or to the bottom. Guests see that order, and new gifts go to the top.

**Architecture:**
- The order of `Wishlist.items` is the only truth. `Wishlist.moveItem` and `addItem` change it.
- Storage keeps each gift's index as `items.position`, added by migration `0002`. The repositories load gifts sorted by it, and `save` writes the indices that changed.
- A `MoveItem` use case sits behind `POST /api/lists/:slug/items/:itemId/move`, which returns `{ ok: true }`.
- On the web, each `ManageItems` row gets a two-by-two move block. Focus stays on the tapped button, and a status region announces each move.

**Tech Stack:** TypeScript, Fastify + zod, Kysely/SQLite, React + TanStack Query, vitest + MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-reorder-items-design.md` · mockup `docs/design/reorder-items-mockup.html` · ADR-0086.

## Global Constraints

- Every PR changes 10 files or fewer, generated files included (skill small-prs). Stack: Task 1 targets `main`, then Task 2 → 3 → 4 → 5, each PR built on the one below. The docs PR (spec, mockup, this plan, ADR-0086) targets `main` separately.
- `to` is exactly one of `'top' | 'up' | 'down' | 'bottom'`. The TypeScript type is named `MoveTarget`.
- Moving past an end changes nothing, and is neither an error nor a 409.
- A move is not a ledger event. Nothing is appended to `event_log`.
- `position` is the gift's 0-based index, with 0 at the top. There is no unique index and no CHECK on it.
- Copy, exactly:
  - group label: `Move {title}`
  - button names: `Move {title} up`, `Move {title} to the top`, `Move {title} down`, `Move {title} to the bottom`
  - announcement: `{title} moved to position {n} of {m}.`
- Button order in the block: row 1 is Up, then Top; row 2 is Down, then Bottom. Icons are the mockup's SVG paths. Each target is at least 44 × 44 px.
- No plan identifiers in test names or comments. Domain instants are named `at`. Don't write tests that check removed code is absent.
- Before each push, follow skill verifying-gubbins-locally. Use `--e2e` for the PR that targets `main`. Web vitest in the dev container needs `--testTimeout=30000`. Run at most 3 verifies in parallel.
- Write PR bodies with skill writing-pr-descriptions. Self-review with skill reviewing-for-recurring-feedback. Run R1 and R2 before any PR opens (skill running-review-rounds).

## Review Focus

1. **A move on a stale page** (another device already moved or deleted that gift). The server applies `to` to the gift's current place. A deleted gift gives 404, which sends the owner back to the token gate, as Delete does. Test: Task 3 route test (foreign/unknown item 404). The web 404 path is tested in Task 5.
2. **Moving the only gift.** All four buttons are disabled, and if a request arrives anyway it is a no-op. Test: Task 1 (`moveItem` on a one-gift list leaves it unchanged); the web disabled-state test in Task 5 includes the last gift.
3. **Adding a gift after reordering.** It lands at the top, and the order the owner set below it is kept. Test: Task 2 contract test "save adds a new item to the top of the list…" (the existing gift's position has to shift from 0 to 1 for it to pass).
4. **Fast double tap on Up.** The second tap is ignored while the first is pending, so the gift moves one place, not two. Test: Task 5 "a tap while a move is pending sends nothing".
5. **A deploy onto a live database.** Every existing list keeps oldest-first order, and lists don't affect each other's positions. Test: Task 2 migration test.

---

### Task 1: `Wishlist` owns the order

**Files:**
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Test: `apps/api/src/domain/entities/Wishlist.test.ts`

**Interfaces:**
- Produces: `export type MoveTarget = 'top' | 'up' | 'down' | 'bottom';` exported from `Wishlist.ts`.
- Produces: `Wishlist.moveItem(itemId: string, to: MoveTarget): void`. It throws `ItemNotFoundError` for an item that isn't on the list, through `getItem`.
- Changes: `addItem` puts the new item first (`unshift`). The doc comment on `items` becomes "The items, in the owner's order: the first is the top of the list."

- [ ] **Step 1: Write the failing tests** in `Wishlist.test.ts`. Use a list with three gifts, A, B and C, in that order, built with `aWishlist()` or `reconstitute`, as the file already does:
  - `it('adds a new item at the top of the list')`: after `addItem` twice (X, then Y), `items` ids are `[Y, X]`.
  - `it.each([['top', 'C', ['C','A','B']], ['up', 'C', ['A','C','B']], ['down', 'A', ['B','A','C']], ['bottom', 'A', ['B','C','A']]])('moves an item %s', …)`.
  - `it.each([['top','A'], ['up','A'], ['down','C'], ['bottom','C']])('leaves the order as it is when %s would pass the end', …)`: the order is still `[A,B,C]`.
- [ ] **Step 2: Run** `~/.claude/skills/verifying-gubbins-locally/verify.sh --quick apps/api src/domain/entities/Wishlist.test.ts`. Expected: FAIL, because `moveItem` is not a function and the new item is last.
- [ ] **Step 3: Implement** `moveItem` and the `unshift` in `addItem`.
- [ ] **Step 4: Run the whole API suite** with `verify.sh --quick apps/api`. Fix any existing test that assumed `addItem` appends. Change its expectation to the new order, not the code. The contract test `save adds a new item to the list` still passes here, because storage ignores the domain's order until Task 2.
- [ ] **Step 5: Commit** with message `feat(api): the list decides its order: new gifts first, gifts move up, down, to the top or bottom`.

### Task 2: Storage keeps the order

**Files:**
- Create: `apps/api/src/infrastructure/db/migrations/0002_item_positions.ts`
- Create: `apps/api/src/infrastructure/db/migrations/0002_item_positions.integration.test.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/index.ts`
- Modify: `apps/api/src/infrastructure/db/schema.ts`
- Modify: `apps/api/src/application/ports/ItemRepository.ts`
- Modify: `apps/api/src/infrastructure/ItemRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Modify: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`

**Interfaces:**
- Consumes: `Wishlist.moveItem` and `MoveTarget` from Task 1.
- Produces:
  - column `items.position integer not null`;
  - `ItemRow.position: number`;
  - `ItemRepositoryKysely.insert(item: Item, position: number)`;
  - `ItemRepositoryKysely.savePosition(itemId: string, position: number)`;
  - `findAllByWishlistId` sorted by `position`, then `id`. Its doc comment becomes "in the owner's order".

- [ ] **Step 1: Write the failing migration test.**
  - Run `0001_init` alone with `runMigrations(db, { '0001_init': migrations['0001_init'] })`.
  - Insert two lists with raw SQL, each with three items whose `created_at` values are out of id order.
  - Run all `migrations`.
  - Test `it('numbers each list\'s existing items from 0, oldest first')`: per list, `select id, position … order by position` equals the oldest-first ids with positions `[0,1,2]`.
- [ ] **Step 2: Write the failing contract tests** in `wishlistRepository.contract.ts`:
  - Replace `loads every item of the list, in the order they were added` with `it('save stores a moved item\'s place, so the next load has the new order')`. Seed list C with Stroller and Crib, call `moveItem(stroller, 'top')`, save, then reload. Expect `[Stroller, Crib]` by id.
  - Change `save adds a new item to the list, with its stream at seq 0` so it expects `[ITEM_A2, ITEM_A]`. Rename it `save adds a new item to the top of the list, with its stream at seq 0`.
  - Add `it('saving one list\'s new order leaves another list\'s order as it was')`. Reorder list C and save. List A's ids are unchanged.
- [ ] **Step 3: Run** `verify.sh --quick apps/api src/application/ports/contracts src/infrastructure/db`. Expected: FAIL.
- [ ] **Step 4: Implement:**
  - **Migration `0002_item_positions`:** `alter table items add column position integer not null default 0`, then `update items set position = (select count(*) from items o where o.wishlist_id = items.wishlist_id and (o.created_at < items.created_at or (o.created_at = items.created_at and o.id < items.id)))`. Register it in `index.ts`.
  - **`schema.ts`:** add `position: number` to `ItemsTable`.
  - **Kysely adapters:**
    - `insert` takes the position;
    - `WishlistRepositoryKysely.insert` and `save` pass each item's index;
    - `save` calls `savePosition` when `row.position !== index`;
    - drop the `created_at` tie-break comment.
  - **`InMemoryRepositories`:** `toRow(item, index)` stores `position`, and `hydrate` sorts rows by `position`.
- [ ] **Step 5: Run** `verify.sh --quick apps/api`. Expected: PASS. `schema.integration.test.ts` and `assertSchemaMatches` must accept the new column; update their expected column list if they hold one.
- [ ] **Step 6: Commit** with message `feat(api): store each gift's place in its list; existing lists keep oldest first`.

### Task 3: `MoveItem` use case

**Files:**
- Create: `apps/api/src/application/use-cases/MoveItem.ts`
- Create: `apps/api/src/application/use-cases/MoveItem.test.ts`

**Interfaces:**
- Consumes: `Wishlist.moveItem` and `MoveTarget`.
- Produces:
  - `export interface MoveItemInput { wishlistId: string; itemId: string; to: MoveTarget }`;
  - `class MoveItem { constructor(unitOfWork: UnitOfWork, clock: Clock); execute(input: MoveItemInput, access: AccessContext): Promise<void> }`.
  
  It has the same shape as `DeleteItem`. A caller that isn't the owner gets `WishlistNotFoundError`.

- [ ] **Step 1: Write the failing tests**, built like `DeleteItem.test.ts`:
  - `it('saves the new order, appending no event')`: after `to: 'top'`, the reloaded list has the moved gift first, and the event store's count is unchanged.
  - `it('treats a caller who is not the owner as no list')`: rejects with `WishlistNotFoundError`.
- [ ] **Step 2: Run** `verify.sh --quick apps/api src/application/use-cases/MoveItem.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, mirroring `DeleteItem.execute`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(api): the owner moves a gift`.

### Task 4: The move route

**Files:**
- Modify: `packages/shared-types/src/ownerEditing.ts` (and `index.ts` only if it doesn't already export `*` from it)
- Modify: `packages/shared-types/src/ownerEditing.test.ts`
- Modify: `apps/api/src/presentation/compositionRoot.ts`
- Modify: `apps/api/src/presentation/routes.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify: `apps/api/src/presentation/openApiDocument.ts`
- Modify: `apps/api/src/presentation/openApiDocument.test.ts`
- Generated: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Consumes: `MoveItem` from Task 3.
- Produces:
  - `moveItemRequestSchema = z.object({ to: z.enum(['top', 'up', 'down', 'bottom']) })` and the type `MoveItemRequest`;
  - route `POST /api/lists/:slug/items/:itemId/move` with `operationId: 'moveItem'`. Its responses are 200 `editedResponseSchema`, 400 `INVALID_REQUEST` and 404, with the delete route's 404 wording. There is no 409.
  - `AppDependencies.moveItem`.

- [ ] **Step 1: Write the failing tests:**
  - In `ownerEditing.test.ts`: `it('accepts each move target and refuses any other')`. Each of the four values parses. `'first'` fails, and so does `{}`.
  - In `routes.integration.test.ts`, next to the delete tests: `it('the owner moves a gift to the top, and the guest view lists it first')`. The response is 200 with `{ ok: true }`, and the list view's `items.map(i => i.id)` has the moved gift first.
  - Also in `routes.integration.test.ts`: `it('answers 404 for a gift on another list')`.
  - In `openApiDocument.test.ts`: `moveItem: ['200', '400', '404']`.
- [ ] **Step 2: Run** `verify.sh --quick apps/api src/presentation` and `verify.sh --quick packages/shared-types`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the schema, wire `new MoveItem(unitOfWork, clock)`, write the route modelled on the delete route, and add `unusedDependency('moveItem')`. Regenerate the OpenAPI document and the client types with the repo's script (`npm run openapi` or the one `verify.sh` names when they are stale).
- [ ] **Step 4: Run** the same commands. Expected: PASS. Check `git diff --stat origin/<base>...HEAD | tail -1` shows 10 files or fewer.
- [ ] **Step 5: Commit** with message `feat(api): owner route to move a gift`.

### Task 5: Move buttons on the manage page

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/src/features/manage/MoveItemButtons.tsx`
- Modify: `apps/web/src/features/manage/ManageItems.tsx`
- Modify: `apps/web/src/features/manage/ManageItems.test.tsx`
- Create: `e2e/owner-reorders-gifts.spec.ts`

**Interfaces:**
- Consumes: `moveItem` in `schema.gen.ts` from Task 4.
- Produces: `api.moveItem(slug: string, itemId: string, to: MoveTarget): Promise<EditedResponse>`, which goes through `unwrap` like `deleteItem`. The web side declares its own `type MoveTarget = MoveItemRequest['to']`.
- `MoveItemButtons` props: `{ title: string; itemId: string; index: number; count: number; pending: boolean; onMove(to: MoveTarget): void }`.
  - It renders `role="group"` with `aria-label="Move {title}"` and the four buttons in the constrained order.
  - Each button has `id="move-{to}-{itemId}"`.
  - A button is `disabled` only at an end (Up and Top when `index === 0`; Down and Bottom when `index === count - 1`).
  - While `pending` is true, every button has `aria-disabled="true"` and its click does nothing.

`ManageItems` owns the move mutation and three pieces of state:
- **The pending flag:** the mutation stays pending until the refetch finishes, as Delete's does.
- **The last move,** `{ itemId, to }`. After the refetch, an effect focuses `move-{to}-{itemId}`, or, if that button is now disabled, the first enabled button in the block.
- **The announcement:** `{title} moved to position {n} of {m}.`, worked out from the refetched `items`. It goes in one always-mounted `<p role="status">` below the list.

On error:
- the error appears in that row's `role="alert"` paragraph, and focus moves to it;
- there is no announcement;
- a 404 calls `onUnauthorized()`;
- the error clears when that gift's next move starts.

While a row shows the edit form, it has no move block.

- [ ] **Step 1: Write the failing tests** in `ManageItems.test.tsx`. Use MSW handlers that answer 200 `{ ok: true }` and then serve the reordered manage view, as the delete tests do.
  - `it('moves a gift to the top, keeps focus on that button, and says where it went')`: posts `{ to: 'top' }`. After the refetch, "Move Swaddles to the top" is disabled, so focus falls back to "Move Swaddles down". The status reads `Swaddles moved to position 1 of 3.`
  - `it('keeps focus on Up after moving up one place')`: with A, B and C, tap "Move C up". Focus is on "Move C up", and the status reads `C moved to position 2 of 3.`
  - `it.each` over the four buttons, `it('sends %s for the %s button')`: the request body is `{ to }`.
  - `it('disables Up and Top on the first gift and Down and Bottom on the last')`.
  - `it('ignores a tap while a move is pending')`: hold the first response open, then tap Up again. Exactly one request is sent.
  - `it("shows the server's error in the gift's row, with focus on it, and announces nothing")`: a 409 from MSW gives an alert with that message, focus on the alert, and an empty status.
  - `it('sends the owner back to the token gate on 404')`: `onUnauthorized` is called once.
- [ ] **Step 2: Run** `verify.sh --quick apps/web src/features/manage/ManageItems.test.tsx --testTimeout=30000`. Expected: FAIL.
- [ ] **Step 3: Implement** `api.moveItem`, `MoveItemButtons`, and the `ManageItems` changes. Lay out the block as in mockup B2:
  - a two-column grid to the right of the gift's details;
  - Edit and Delete, Delete's hint, confirmation and error all stay in the left column.
  
  Use the existing button classes (`btn-secondary btn-sm`), with icon-only padding so each target is 44 × 44 px, and the browser's default focus ring as the app already uses. If you add the moved-row highlight, it must be a left-edge bar and must respect `prefers-reduced-motion`. It is optional.
- [ ] **Step 4: Write the e2e test** in `e2e/owner-reorders-gifts.spec.ts`, using the helpers in `e2e/owner-edits-a-list.spec.ts`. `test('the owner moves a gift to the top, and guests see it first')`:
  - the owner adds Kettle, Skillet and Cookbook, which appear in the order Cookbook, Skillet, Kettle;
  - the owner taps "Move Kettle to the top";
  - the guest page lists Kettle, Cookbook, Skillet.
- [ ] **Step 5: Run** the web suite and `verify.sh --e2e` on the stack tip. Announce the e2e run to peer sessions first. Expected: PASS.
- [ ] **Step 6: Commit** with message `feat(web): move buttons beside each gift on the manage page`.
