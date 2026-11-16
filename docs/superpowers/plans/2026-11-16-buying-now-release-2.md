# "I'm buying this" (release 2: undo a buy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest can undo any buy of theirs from "Your contributions" ("I didn't buy it"), and every unit bought goes straight back to other guests.

**Architecture:** `Hold` gains `buyUndoneAt`, the status `undone` and `undoBuy(at)`; `Item.undoBuy` and `Wishlist.undoBuy` reach it (ADR-0078), with `canUndoBuy` beside them. A new `BuyUndone` ledger event is folded into a new `holds.buy_undone_at` column (migration 0005). `UndoBuy` runs through the shared hold command body, which gains an `alreadyDone` check so a second undo answers 200 and appends nothing. `POST …/holds/:holdId/undo-buy` joins the body-less hold routes. The web adds the action to `HoldActions` with a confirmation like "Release hold".

**Tech Stack:** TypeScript, Fastify + zod (fastify-type-provider-zod), Kysely on SQLite, Vitest, React + TanStack Query, openapi-fetch, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-buying-now-design.md`: "Release 2: undo a purchase" and the release 2 rows of Concurrency, Docs and Tests. Owner rulings: `.superpowers/sdd/2026-11-16-buying-now-release-2/rulings.md` (ruling 11 holds the names).

## Global Constraints

- At most 10 changed files per PR, generated files and tests included (`git diff --stat <base>...HEAD | tail -1`). The one exception is Task 4, about 13 files (owner ruling 12). One route or contract change per PR. Docs go in their own PR.
- Every PR stacks on the one before it, and the first one stacks on the plan PR. At most 8 stacked PRs are open at once: with the spec PR (#290) and the plan PR open, Task 6's PR is the eighth, so Task 7's opens only after #290 merges.
- No plan IDs, task numbers or branch names in code, comments, test names, commits or PR bodies.
- **Buy names, never new "purchase" names** (owner ruling, 2026-11-16): event `BuyUndone`; `Hold.buyUndoneAt`, `Hold.undoBuy(at)`, `Hold.canUndoBuyAt(at)`; column `holds.buy_undone_at`; status `undone`; `Item.undoBuy` / `Item.canUndoBuy`; `Wishlist.undoBuy` / `Wishlist.canUndoBuy`; `HoldPermissions.mayUndoBuy`; use case `UndoBuy`; route `POST /api/lists/:slug/holds/:holdId/undo-buy`, operationId `undoBuy`; `HoldView.actions.undoBuy`; web `HoldAction` `'undoBuy'`, `api.undoBuy`. Existing purchase-named code keeps its names (see the release 3 list at the end).
- `Hold.reconstitute`'s `buyUndoneAt` is optional (defaulting to null) through release 2; Tasks 8 and 9, after release 2, make it required (owner ruling 14).
- Copy, verbatim from the spec (straight quotes in the spec are curly in the UI):
  - Card button: `I didn't buy it`, secondary style, on a card whose `actions.undoBuy` is true.
  - Question: `Undo buying {title}? Other guests will be able to buy it.`; with `purchasedUnits > 1`: `… able to buy them.`. Buttons `Yes, undo it` (primary) and `Keep it` (secondary).
  - Success: `{title} is available to other guests again.` Failure fallback: `Couldn't undo buying {title}.`
  - Status line for `undone` (never sent by the list view, but the switch is exhaustive): `Undone.`
  - Buying-sheet note, second line: one unit `Other guests will then see it's taken, so no one else buys it while you're getting it. If plans change, you can undo it from Your contributions.`; N > 1 `Other guests will then see they're taken, so no one else buys them while you're getting them. If plans change, you can undo it from Your contributions.` The first line is unchanged.
- Route errors: 404 generic (`{ message: 'Not found' }`) for an unknown hold or another session's; 409 `hold_not_active` for a hold that was never bought; a hold already undone answers 200.
- Each PR is verified with skill verifying-gubbins-locally: plain `scripts/verify.sh` for a stacked PR, `--e2e` once it targets main.

## Review Focus

1. **The guest taps "Yes, undo it" in two tabs, or retries after a lost answer:** both answer 200 with the undone hold, and only one `BuyUndone` is appended. Pinned in Task 5 (`UndoBuy`'s `alreadyDone` check).
2. **A buy request replayed after its undo** (slow wifi delivering the first tap late): it answers the undone hold and never buys again. Pinned in Task 1 (`Wishlist.findHoldForReplay`).
3. **A stale tab taps "Mark as purchased" on a hold whose buy was undone:** 409 `hold_not_active`, not the lapsed-hold refusal. Pinned in Task 1 (`Item.purchaseHold`'s status list).
4. **Another guest, or no session, sends `undo-buy` for someone's hold:** the generic 404, whether the hold is active, bought or already undone. Pinned in Task 5 (IDOR tables).
5. **The undo is decided but not written:** `wishlists.save` skips holds whose compared columns didn't change. Pinned in Task 2 (wishlist repository contract, real adapter and fake).

## Test map (plan-stage per-test check)

Each test the plan lists, and the production line only it protects. Values and rules appear once, at the layer that owns them.

| Test | Protects |
|---|---|
| Hold: refuses `buyUndoneAt` without a purchase | `Hold` constructor invariant |
| Hold: `statusAt` is `undone` though `purchasedAt` stays | `statusAt`'s first check (also drops the hold from every counter) |
| Hold: `undoBuy` stamps and returns `BuyUndone` | `Hold.undoBuy`'s body |
| Hold: `undoBuy` refuses active, expired, released, undone | `canUndoBuyAt`, the guard `undoBuy` uses |
| Item: `undoBuy` at its `asOf`, one event | `Item.undoBuy`'s `asOf` and `recordEvent` |
| Item: `undoBuy` on a hold it did not load | `Item.undoBuy`'s `ownHold` |
| Item: `canUndoBuy` purchased, and loaded | `Item.canUndoBuy`'s delegation and `?? false` |
| Item: `purchaseHold` refuses released, purchased, undone as not active (one table) | `purchaseHold`'s status list |
| Wishlist: `undoBuy` has the item decide | `Wishlist.undoBuy`'s `memberOf` and call |
| Wishlist: other-list refusal and questions rows | `Wishlist.undoBuy` / `canUndoBuy`'s `lookup` |
| Wishlist: replay finds an expired or undone hold (one table) | `findHoldForReplay` has no status filter |
| HoldPermissions: `mayUndoBuy` rows | `mayUndoBuy` |
| Contract: an undone buy saved through `wishlists.save` reloads undone | `lifecycleColumns`, the row mapping, the fake's copy (`save`'s select list is compile-enforced) |
| Schema: CHECK row; migration names | migration 0005's CHECK; its `index.ts` entry |
| HoldView: `actions.undoBuy` true for a bought hold | `toHoldView`'s `undoBuy` line |
| Shared schema: accepts `undone` | `holdStatusSchema` |
| Actor matrix: `BuyUndone` raised as guest | `UndoBuy`'s permission (`mayUndoBuy`) and the route row |
| Rebuild: busy ledger with an undone buy; drift repair | the `BuyUndone` fold |
| UndoBuy: records as guest, saves the instant | `UndoBuy`'s command wiring and save |
| UndoBuy: second undo answers, appends nothing | `runHoldCommand`'s `alreadyDone` branch and `UndoBuy`'s check |
| GetListView: not released or undone | `myHolds`' filter |
| Route: undo answers 200 with the undone view | the route answers the command's view (status `undone`) |
| Route: generic 404 tables gain `undo-buy` | permission → not found for this route (security matrix) |
| Web: asks; plural; announces; failure copy | the confirm branch, `purchasedUnits > 1`, the success message, `couldnt.undoBuy` |
| Web: focus and clearing `it.each` gain undo | the named set of outcomes whose card leaves, at each use |
| Web: note copy (1 and 2) | `HoldDialog`'s buy-mode note |
| Client: `undoBuy` row | `api.undoBuy`'s URL |
| e2e: buy 2, undo, "Wanted: 5 more" | the journey across every layer |

---

### Task 1: The undo in the domain

**PR:** stacks on the plan PR. 10 files. The PR body names the later PRs, by number once open, that call `Wishlist.canUndoBuy` (the hold view), call `Wishlist.undoBuy` and `HoldPermissions.mayUndoBuy` (the undo use case and route), and add `BuyUndone` to the ledger union.

**Files:**
- Create: `apps/api/src/domain/events/BuyUndoneEvent.ts`
- Modify: `apps/api/src/domain/events/ItemPurchasedEvent.ts` (doc comment only: the guest who bought it can undo it with `BuyUndone`)
- Modify: `apps/api/src/domain/entities/Hold.ts`; Test: `Hold.test.ts`
- Modify: `apps/api/src/domain/entities/Item.ts`; Test: `Item.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`; Test: `Wishlist.test.ts`
- Modify: `apps/api/src/domain/policies/HoldPermissions.ts`; Test: `HoldPermissions.test.ts`

**Interfaces:**
- Produces:
  - `interface BuyUndoneEvent { type: 'BuyUndone'; v: 1; holdId: string; occurredAt: string }` (doc: who undid it is the envelope's actor, ADR-0075; `occurredAt` folds into `holds.buy_undone_at`). Not yet in `LedgerEvent` (Task 4).
  - `type HoldStatus = 'active' | 'expired' | 'released' | 'purchased' | 'undone'`
  - `Hold.reconstitute({ …, buyUndoneAt?: Date | null })` (optional, defaulting to null, until Tasks 8 and 9 make it required, owner ruling 14; no code comment justifies the default, and the PR body names those follow-ups); getter `buyUndoneAt: Date | null`; `canUndoBuyAt(at: Date): boolean`; `undoBuy(at: Date): BuyUndoneEvent`
  - `Item.canUndoBuy(hold: Hold): boolean`; `Item.undoBuy(hold: Hold): { hold: Hold; event: BuyUndoneEvent; expectedSeq: number }`
  - `Wishlist.canUndoBuy(hold: Hold): boolean`; `Wishlist.undoBuy(hold: Hold): HoldCommandResult<BuyUndoneEvent>`
  - `HoldPermissions.mayUndoBuy(hold, credentials): Actor | null` (the `placedBy` rule)

- [ ] **Step 1: Write the failing `Hold` tests** in `Hold.test.ts`, using its `persisted()` helper:
  - Under `Hold.reconstitute`: `it('refuses a hold whose buy was undone but that was never bought')`: `persisted({ buyUndoneAt: CREATED })` throws `DomainValidationError`.
  - Under `Hold.statusAt`: `it('is undone once buyUndoneAt is set, though purchasedAt stays')`: `persisted({ purchasedAt: CREATED, purchasedUnits: 1, buyUndoneAt: CREATED }).statusAt(CREATED)` is `'undone'`.
  - New `describe('Hold.undoBuy')`, shaped like `Hold.release`'s:
    - `it('stamps buyUndoneAt and returns BuyUndone')`: on a purchased hold, `undoBuy(CREATED)` equals `{ type: 'BuyUndone', v: 1, holdId: HOLD_ID, occurredAt: CREATED.toISOString() }`, and `statusAt(CREATED)` is then `'undone'`.
    - `it.each` over active, expired, released and undone: `'refuses a %s hold'` with `HoldNotActiveError`.
- [ ] **Step 2: Run them and see them fail:** `scripts/verify.sh --quick apps/api src/domain/entities/Hold.test.ts`.
- [ ] **Step 3: Implement in `Hold.ts`.** `_buyUndoneAt` is the constructor's last parameter. Constructor invariant, message `'A hold can have its buy undone only once bought'`. `statusAt` checks `_buyUndoneAt` first. `canUndoBuyAt(at)` is `statusAt(at) === 'purchased'`, and `undoBuy` refuses with `HoldNotActiveError` unless `canUndoBuyAt(at)`. Add `undoBuy` to the class note's list of methods that take an instant and to the constructor comment's list of the hold's own commands, whose "the one invariant" becomes "the invariants", and the comment on `markPurchased` stays true (it already refuses an undone hold: `purchasedAt` stays set). Create `BuyUndoneEvent.ts` and update `ItemPurchasedEvent`'s doc comment.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Write the failing `Item` tests** in `Item.test.ts`:
  - In `Item hold commands`: `it('undoBuy undoes its own hold at the instant it was loaded at, and records one event on its stream')`, shaped like `extendHold`'s: a purchased hold (`holdOn({ purchasedAt: T0, purchasedUnits: 1 })`) on an item loaded at seq 1 and `at(DAY)`. After `undoBuy(hold)`: `event.type` is `'BuyUndone'`, `hold.buyUndoneAt` equals `at(DAY)`, `expectedSeq` is 1 and `item.seq` is 2. Don't assert the units freed: the counters follow `statusAt`, pinned in `Hold.test.ts`.
  - Add `expect(() => holding([]).undoBuy(holdOn())).toThrow(HoldNotFoundError)` to `'refuses a command on a hold it did not load, with HoldNotFoundError'`.
  - In the `holdStatus, canExtendHold and canReleaseHold` block (rename it to add `canUndoBuy`): `it('canUndoBuy: purchased, and loaded')`: true for a purchased hold, false for an active one, false for a hold it did not load. The other refused states are `Hold.undoBuy`'s table.
  - In `Item.purchaseHold`: replace `'refuses a released hold, or one already purchased'` with one `it.each` over released, purchased and undone, `'refuses a %s hold with HoldNotActiveError, not as lapsed'`.
- [ ] **Step 6: Run them and see them fail.**
- [ ] **Step 7: Implement in `Item.ts`.** `canUndoBuy` is `findHold(...)?.canUndoBuyAt(this.asOf) ?? false`, beside `canReleaseHold`. `undoBuy` follows `releaseHold` (`ownHold`, `own.undoBuy(this.asOf)`, `recordEvent`), with the doc comment "Reach it through `Wishlist.undoBuy`, which authorizes the hold." `purchaseHold`'s refusal adds `'undone'` to its status list.
- [ ] **Step 8: Run them and see them pass.**
- [ ] **Step 9: Write the failing `Wishlist` tests** in `Wishlist.test.ts`:
  - `it('undoBuy has the item decide, and returns that item')`, beside `releaseHold`'s, on a purchased hold.
  - Add `undoBuy` to `"refuses a hold on another list's item with HoldNotFoundError"`, and `canUndoBuy` to the other-list row of `Wishlist hold questions` (`false`) and to `asks` (true for a purchased hold, false for the active and released ones).
  - In `Wishlist.findHoldForReplay`: turn `"returns the session's own hold for a key it already used, even once that hold has expired"` into an `it.each` over expired and undone, named `"returns the session's own hold for a key it already used, whatever its state: %s"`, so a replayed buy answers the undone hold and never buys again.
- [ ] **Step 10: Write the failing permission rows:** add `'mayUndoBuy'` to `commands` in `HoldPermissions.test.ts`.
- [ ] **Step 11: Run them and see them fail.** The undone replay row passes at once (`findHoldForReplay` has no status filter): show it failing by filtering out undone holds there for one run, then revert.
- [ ] **Step 12: Implement** `Wishlist.canUndoBuy` (as `canReleaseHold`), `Wishlist.undoBuy` (as `releaseHold`) and `HoldPermissions.mayUndoBuy` (as `mayRelease`).
- [ ] **Step 13: Run them and see them pass,** then `scripts/verify.sh` on a clean tree and commit "feat(api): undo a buy in the domain".

### Task 2: Storing an undone buy

**PR:** stacks on Task 1. 8 files.

**Files:**
- Create: `apps/api/src/infrastructure/db/migrations/0005_hold_buy_undone.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/index.ts`, `apps/api/src/infrastructure/db/schema.ts` (`HoldsTable.buy_undone_at: string | null`)
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts` (`lifecycleColumns` and the row mapping), `apps/api/src/infrastructure/WishlistRepositoryKysely.ts` (the stored-hold select list in `save`)
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts` (the hold copy)
- Test: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`, `apps/api/src/infrastructure/db/schema.integration.test.ts`

**Interfaces:**
- Consumes: Task 1's `Hold.buyUndoneAt`, `Hold.reconstitute({ buyUndoneAt })`, `Wishlist.purchaseHold`, `Wishlist.undoBuy`.
- Produces: column `holds.buy_undone_at` (nullable text, ISO instant).

- [ ] **Step 1: Write the failing tests.**
  - `wishlistRepository.contract.ts`: `it('saves an undone buy through wishlists.save, and the hold reloads as undone')`: insert a hold, load the list, `purchaseHold(hold, 1)`, save; load again later, `undoBuy(hold)`, save; reload: `holdStatus` is `'undone'` and `buyUndoneAt` equals that instant. Both adapters run it.
  - `schema.integration.test.ts`: add the row `['a buy undone on a hold that is not purchased', { buy_undone_at: NOW }]` to the CHECK table, and `{ name: '0005_hold_buy_undone' }` to the migration-names list.
- [ ] **Step 2: Run them and see them fail:** `scripts/verify.sh --quick apps/api <file>` for `src/infrastructure/contracts.integration.test.ts` (the real adapter), `src/application/test-fakes/InMemoryRepositories.contract.test.ts` (the fake) and `src/infrastructure/db/schema.integration.test.ts`.
- [ ] **Step 3: Implement.** The migration is raw SQL like `0004`: `alter table holds add column buy_undone_at text check (buy_undone_at is null or purchased_at is not null)`, with a why-comment: a column CHECK, since SQLite can't add a table constraint to an existing table, and structural only (ADR-0083). Register it in `index.ts`. Add `buy_undone_at` to `lifecycleColumns`, to the row → `Hold.reconstitute` mapping, to `save`'s select list in `WishlistRepositoryKysely`, and to the fake's copy.
- [ ] **Step 4: Run them and see them pass,** then `scripts/verify.sh` and commit "feat(api): store when a buy was undone".

### Task 3: The undone status and the undo flag in the hold view

**PR:** stacks on Task 2. 10 files, two of them generated. No hold has the status yet over HTTP; the flag is false until a hold is bought.

**Files:**
- Modify: `packages/shared-types/src/holdView.ts` (`holdStatusSchema` gains `'undone'`; `actions` gains `undoBuy: z.boolean()`); Test: `holdView.test.ts` (fixture; `'undone'` joins the accepted statuses)
- Modify: `apps/api/src/application/views/HoldView.ts`; Test: `HoldView.test.ts`
- Generated: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`
- Modify: `apps/web/src/features/holds/YourContributions.tsx` (`statusLine`: `case 'undone': return 'Undone.'`, with a why-comment that the list view never sends one)
- Fixtures: `apps/web/src/test/holdView.ts`, `apps/web/src/api/client.test.ts`, `apps/web/src/features/holds/YourContributions.test.tsx` (add `undoBuy: false` to every `actions` literal, except the `purchased` fixture, which gets `undoBuy: true` as the server now sends; no new tests)

**Interfaces:**
- Consumes: `Wishlist.canUndoBuy` (Task 1).
- Produces: `HoldView.actions: { extend: boolean; release: boolean; purchase: boolean; undoBuy: boolean }`; `HoldStatus` includes `'undone'` in shared-types.

- [ ] **Step 1: Write the failing test** in `HoldView.test.ts`: the existing view's expected `actions` gains `undoBuy: false`, and after `bought`'s line add `expect(toHoldView(wishlistAt(at(DAY), [bought]), bought).actions.undoBuy).toBe(true)` (the flag reads `canUndoBuy`, not a constant).
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement** `undoBuy: wishlist.canUndoBuy(hold)` in `toHoldView`, extend the doc comment on `actions` ("undo a buy while bought"), and change the shared schema. Regenerate the OpenAPI document and the web schema the way `CONTRIBUTING.md` describes. Update the fixtures and `statusLine`.
- [ ] **Step 4: Run, verify and commit** "feat: carry the undone status and the undo flag in the hold view".

### Task 4: `BuyUndone` in the ledger, and the undo route

**PR:** stacks on Task 3. About 13 files, the one exception to the cap (owner ruling 12): `rebuildProjections` and the ledger actor matrix are keyed by `LedgerEvent`, and the matrix raises every event type over HTTP, so the union entry, `UndoBuy` and the route can't ship apart. The PR body gives that reason for its size, without task numbers.

**Files:**
- Modify: `apps/api/src/domain/events/LedgerEvent.ts`
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.ts`; Test: `rebuildProjections.integration.test.ts`
- Test: `apps/api/src/presentation/ledgerActors.integration.test.ts`
- Create: `apps/api/src/application/use-cases/UndoBuy.ts`; Test: `UndoBuy.test.ts` (new; setup copied from `ReleaseHold.test.ts`)
- Modify: `apps/api/src/presentation/routes.ts`, `compositionRoot.ts`, `openApiDocument.ts`; Test: `openApiDocument.test.ts` (the operation table gains `undoBuy: ['200', '400', '404', '409']`), `openApiDocument.noDatabase.test.ts` (the path count goes up by one)
- Generated: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Consumes: Task 1's `Wishlist.undoBuy`, `HoldPermissions.mayUndoBuy`; Task 2's column.
- Produces: `class UndoBuy implements HoldCommand { constructor(unitOfWork: UnitOfWork, clock: Clock); execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> }`; `AppDependencies.undoBuy: UndoBuy`; route `POST /api/lists/{slug}/holds/{holdId}/undo-buy` (operationId `undoBuy`).

- [ ] **Step 1: Write the failing tests.**
  - `UndoBuy.test.ts`: `it('records BuyUndone as the guest, and saves the instant the buy was undone')`: hold, buy (`MarkHoldPurchased`), then undo at T0 + 1 day. The returned view's `status` is `'undone'`; the reloaded hold's `buyUndoneAt` is that instant; the stream's last entry is `['BuyUndone', 'guest']`. Don't assert availability or action flags: the domain and `toHoldView` own them.
  - `ledgerActors.integration.test.ts`: `PERMITTED_ACTORS` gains `BuyUndone: ['guest']`; `raiseEveryEventType` adds `expect((await bought.act('undo-buy')).statusCode).toBe(200)` after `bought`'s purchase. The existing two tests then cover it.
  - `rebuildProjections.integration.test.ts`: `aBusyLedger` adds a hold that is bought then undone (`deps.undoBuy`), so `'re-folds exactly the state the write path maintained incrementally'` covers the fold; `projections()` selects `buy_undone_at`, and `'repairs a projection that drifted from the ledger'` nulls it too.
  - The two OpenAPI tests as listed above.
- [ ] **Step 2: Run them and see them fail** (compile errors are the expected failure).
- [ ] **Step 3: Implement.** `LedgerEvent` gains `BuyUndoneEvent`. `rebuildProjections` gets `case 'BuyUndone'` setting `buy_undone_at`,, and the `ItemHeld` insert writes `buy_undone_at: null` beside the other lifecycle nulls, for consistency (no test can see it). `UndoBuy` is `ReleaseHold` with `HoldPermissions.mayUndoBuy` and `wishlist.undoBuy(hold)`. In `routes.ts`, `holdCommands`' `action` type widens to the path segment `'extend' | 'release' | 'undo-buy'`, with the row `{ action: 'undo-buy', operationId: 'undoBuy', command: deps.undoBuy, done: 'The buy was undone; its units are free for others.', conflict: 'The hold was never bought (hold_not_active).' }`. Until Task 5, a second undo answers that 409. Wire it in `compositionRoot.ts` and `openApiDocument.ts`, then regenerate.
- [ ] **Step 4: Run them and see them pass,** then verify and commit "feat(api): undo a buy over HTTP, recorded as BuyUndone".

### Task 5: A second undo answers 200, and the undone hold leaves the guest's list

**PR:** stacks on Task 4. 6 files.

**Files:**
- Modify: `apps/api/src/application/use-cases/holdCommand.ts`, `UndoBuy.ts`
- Test: `apps/api/src/application/use-cases/UndoBuy.test.ts`
- Modify: `apps/api/src/application/use-cases/GetListView.ts`; Test: `GetListView.test.ts`
- Test: `apps/api/src/presentation/routes.integration.test.ts`

**Interfaces:**
- Produces: `runHoldCommand(ctx, input, access, now, permit, decide, alreadyDone?: (wishlist: Wishlist, hold: Hold) => boolean)`. When `alreadyDone` is given and true after the permission check, it answers `toHoldView(wishlist, hold)` with no `decide`, no append and no save.

- [ ] **Step 1: Write the failing tests.**
  - `UndoBuy.test.ts`: `it('answers a second undo with the undone view and appends nothing')`: after one undo, a second `execute` returns `status: 'undone'` and the stream's length and the item's `seq` are unchanged.
  - `GetListView.test.ts`: rename `'lists purchased holds but not released ones'` to `'lists purchased holds but not released or undone ones'`, and add a third hold that is bought then undone; `myHolds` is still just the bought one.
  - `routes.integration.test.ts`: `holdAction`'s action type gains `'undo-buy'` (no body).
    - `it('undoes a bought hold, answering 200 with its undone view')`.
    - `'undo-buy'` joins the `it.each` of `'%s answers the generic 404 for anything but this session's hold on this list'`.
    - `'undo-buy'` joins the closing actions of `"answers the generic 404, not a state-revealing 409, when another session acts on a hold that was closed by %s"` (its closing step buys then undoes) and the inner list of actions tried.
- [ ] **Step 2: Run them and see the second-undo and list tests fail;** the route tests pass already. Show each passing new test failing when its line is broken (for the route row, drop `'undo-buy'` from `holdCommands`).
- [ ] **Step 3: Implement.** Add `alreadyDone` to `runHoldCommand`, with a why-comment (a repeat of a done command answers the done state rather than an error: the guest's intent already holds). `runHoldCommand`'s doc comment ("check permission, let the wishlist decide, then persist") and `HoldCommand`'s ("Extend, release and mark purchased share one shape") change to match. `UndoBuy` passes `(wishlist, hold) => wishlist.holdStatus(hold) === 'undone'`. `GetListView` filters out `'released'` and `'undone'`, and its comment says why ("released holds and undone buys were the guest's own choice").
- [ ] **Step 4: Run them and see them pass,** then verify and commit "feat(api): answer a repeated undo with the undone hold, and drop undone holds from the guest's list".

### Task 6: "I didn't buy it" on the web

**PR:** stacks on Task 5. 9 files.

**Files:**
- Modify: `apps/web/src/api/client.ts` (`undoBuy(slug, holdId)`, POST to `/api/lists/{slug}/holds/{holdId}/undo-buy`); Test: `client.test.ts` (add `['undoBuy', 'undo-buy']` to the hold-actions table)
- Modify: `apps/web/src/features/holds/useHoldAction.ts` (`HoldAction` gains `'undoBuy'`, with its input and call)
- Modify: `apps/web/src/features/holds/HoldActions.tsx`
- Modify: `apps/web/src/features/holds/YourContributions.tsx`; Test: `YourContributions.test.tsx`
- Modify: `apps/web/src/features/holds/HoldDialog.tsx` (the note's second line); Test: `HoldDialog.test.tsx`
- Test: `e2e/guest-holds-several.spec.ts`

**Interfaces:**
- Consumes: route and operationId from Task 4, `actions.undoBuy` from Task 3.

- [ ] **Step 1: Write the failing component tests** in `YourContributions.test.tsx`, using the `purchased` fixture (`actions.undoBuy: true` since the hold-view task) and a mocked `undo-buy` answering `{ ...purchased, status: 'undone', actions: { …all false } }`:
  - Rename `'shows a purchased hold as done, with a gold wax seal and no actions'` to `'shows a purchased hold as done, with a gold wax seal and only "I didn’t buy it"'`, and assert the card's buttons are exactly `['I didn’t buy it']` (the button shows exactly when `actions.undoBuy` is true).
  - `it('asks "Undo buying Stroller? Other guests will be able to buy it." before undoing, and "Keep it" takes the question away')`.
  - `it('with 2 bought, the question ends "Other guests will be able to buy them."')` (`units: 2, purchasedUnits: 2`).
  - `it('after an undo, announces "Stroller is available to other guests again." once the card has gone')`.
  - `it('says "Couldn’t undo buying Stroller." when the undo fails')` (500 with no message).
  - Turn `'moves focus into the release question, and back to the Release button when the guest keeps the hold'` into an `it.each` over release ("Release hold" / "Keep my hold") and undo ("I didn’t buy it" / "Keep it"), named `'moves focus into the %s question, and back to its button when the guest keeps it'`.
  - Turn `'after a release with other entries left, moves focus to the sheet\'s heading'` into an `it.each` over release and undo.
  - Turn `'clears the last announcement when a new hold appears'` into an `it.each` over release and undo.
- [ ] **Step 2: Update the note tests** in `HoldDialog.test.tsx` to the new second line for 1 and 2 units, renaming `'… and that it can’t be undone'` to `'… and that it can be undone from Your contributions'`.
- [ ] **Step 3: Run them and see them fail:** `scripts/verify.sh --quick apps/web src/features/holds/YourContributions.test.tsx` (and `HoldDialog.test.tsx`).
- [ ] **Step 4: Implement.**
  - `HoldActions`: generalise the release confirmation to one `confirming: 'release' | 'undoBuy' | null` state. Each action supplies its question, its yes and keep labels, and the button that focus returns to, so the focus effect and the question group are shared, not copied. `I didn't buy it` shows when `hold.actions.undoBuy` is true. `couldnt.undoBuy` and the success message come from the copy list. On error, report `failed('undoBuy')`; a repeat answers 200, so it needs no refusal special case.
  - `YourContributions`: name once the outcomes whose card leaves (`release`, `undoBuy`), and use that name both for focus in `showOutcome` and for clearing on a new hold. The component's doc comment says "A release's or an undo's message also clears when a new hold appears".
  - `HoldDialog`: the new second line.
- [ ] **Step 5: Extend the e2e journey** `'a guest buys 2 of 5 with "I’m buying this", and another guest sees "Wanted: 3 more"'` and rename it `'… sees "Wanted: 3 more", then "Wanted: 5 more" after the buy is undone'`. After the other guest sees "Wanted: 3 more", the first guest presses `I didn’t buy it` and `Yes, undo it`, and sees `Baby onesies is available to other guests again.` (the fixture's title). The other guest reloads and sees `Wanted: 5 more`. The `try`/`finally` that closes the other guest's context wraps the undo and the reload. Run the axe scan once while the question is open.
- [ ] **Step 6: Run, verify (`scripts/verify.sh --e2e`, announcing it to peer sessions) and commit** "feat(web): let a guest undo a buy from Your contributions".

### Task 7: Docs for the undo

**PR:** stacks on Task 6. 6 files.

**Files:**
- Modify: `docs/adr/0075-ledger-events-record-the-acting-role.md`: in the single-role list, `PurchaseVoided` goes and `BuyUndone` joins the guest-only types, with one sentence: an owner undo, if built, records the same event as `owner`.
- Modify: `docs/spec/holds.md`: "Purchase is terminal; only the owner can undo it" becomes "The guest who bought a gift can undo the buy from Your contributions; its units go back to other guests (ADR-0088)".
- Modify: `docs/spec/domain-model.md`: "Purchase single only — terminal" becomes "single only — the buying guest can undo it (`BuyUndone`)".
- Modify: `docs/spec/guest-ux.md`: the buy flow's "it can't be undone, so only tap it if you're sure" becomes "if plans change, they can undo it from Your contributions", and the Your contributions description gains "I didn't buy it", its question and its outcome.
- Modify: `docs/spec/data-and-persistence.md`: the event-type list names `BuyUndone` in place of `PurchaseVoided`.
- Modify: `docs/adr/0078-wishlist-is-the-aggregate-root.md`: "A purchase is a terminal state of a `Hold`" becomes "A purchase ends a hold's own lifecycle, except for its buyer's undo (`BuyUndone`, ADR-0088)", amended in place (ADRs are editable through 0.x).

- [ ] **Step 1: Make the edits;** `scripts/verify.sh` (its link check covers the docs) and commit "docs: say a guest can undo a buy".

### Task 8: Every caller passes `buyUndoneAt` (after release 2)

**PR:** targets main, opened once release 2 has merged. About 9 files, mechanical (owner ruling 14).

**Files:** the `Hold.reconstitute` callers that omit it: `application/ports/contracts/fixture.ts`, `application/test-fakes/builders.ts`, and the test helpers in `Hold.test.ts`, `Item.test.ts`, `Wishlist.test.ts`, `HoldPermissions.test.ts`, `HoldView.test.ts`, `MarkHoldPurchased.test.ts`, `inputLimits.test.ts` (find them with `git grep -n "Hold.reconstitute" -- apps`).

- [ ] **Step 1:** Pass `buyUndoneAt: null` (or the test's own value) at every call; no test changes meaning. Verify and commit "refactor(api): pass buyUndoneAt wherever a hold is reconstituted".

### Task 9: `buyUndoneAt` is required

**PR:** stacks on Task 8. 1–2 files.

- [ ] **Step 1:** Drop the `?` and the default from `Hold.reconstitute`'s `buyUndoneAt`; the compiler shows any caller Task 8 missed. Verify and commit "refactor(api): require buyUndoneAt when reconstituting a hold".

---

## Purchase-named code release 2 touches (for the release 3 rename)

Release 2 leaves these names as they are; the purchase → buy rename moves them.

- **Domain:** `HoldStatus` `'purchased'`; `ItemStatus` `'purchased'`; `Item`'s private `unitsOfHoldsThatAre('purchased', …)`; `Wishlist.purchasedCountOf`; Hold's constructor doc comment ("markPurchased"); `Hold.purchasedAt`, `purchasedUnits`, `markPurchased`, `assertCovers`' "Purchased units…" message; `Item.purchaseHold`, `canPurchaseHold`, `purchasableUnits`, `purchaseLimit`, `purchasedCount`; `Wishlist.purchaseHold`, `canPurchaseHold`, `purchasableUnits`; `HoldPermissions.mayPurchase`; `ItemPurchasedEvent` / `'ItemPurchased'` (also stored in prod's event log).
- **Storage:** columns `holds.purchased_at`, `purchased_units`; migration 0005's CHECK references `purchased_at`, so renaming that column needs the CHECK rebuilt too; `lifecycleColumns`; `rebuildProjections`' `case 'ItemPurchased'`.
- **Application and API:** `MarkHoldPurchased`; `markHoldPurchasedRequestSchema` / `MarkHoldPurchasedRequest` and their `holdView.test.ts` tests; `itemStatusSchema`'s `'purchased'`; `HoldView.actions`' doc comment ("purchase while active"); `HoldView.purchasedUnits`, `purchasableUnits`, `actions.purchase`; `holdStatusSchema`'s `'purchased'`; route `…/holds/:holdId/purchase`, operationId `markHoldPurchased`; `PERMITTED_ACTORS.ItemPurchased`; the `GetListView` test "lists purchased holds but not released or undone ones".
- **Web:** `HoldAction` `'purchase'` and `HoldActionInputs.purchase`; in `HoldActions.tsx`, the "Mark as purchased" label, "You can no longer mark {title} as purchased…", `purchaseSheetOpen`, `purchaseButton`, `openPurchaseSheet`, `closePurchaseSheet`, `lostPurchase`; `statusLine`'s "You can still mark it as purchased."; the `purchased` fixture in `YourContributions.test.tsx`; the e2e test "a guest holds 2 of 5, buys 1…" and its "Mark as purchased" steps; `api.markHoldPurchased`; `PurchaseDialog`; `purchasedMessage`; `canRetryPurchase`; `statusLine`'s "Marked as purchased."; `couldnt.purchase`'s "Couldn't mark … as purchased."; the e2e's "Marked as purchased."; `HowHoldingWorks` / `useHoldItem` "holding" names (deferred to the rename by ruling FR-F6).
- **Docs:** `docs/spec/holds.md` and `domain-model.md`'s "Purchase" wording around the lines Task 7 edits; the spec's and ADR-0088's "undo a purchase" titles.
