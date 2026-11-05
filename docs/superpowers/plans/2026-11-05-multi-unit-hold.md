# Multi-unit holds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest holds several units of a single gift in one hold, and can mark fewer as purchased, which releases the rest.

**Architecture:** `Hold` records `units` (fixed at placement) and `purchasedUnits` (set on purchase). `Item` derives every count from them and decides each limit; `Wishlist` passes the units through. Both events carry `units`, the `holds` projection stores them, `HoldView` reports them, and the web gains a shared stepper used by the hold sheet and a new purchase sheet.

**Tech Stack:** TypeScript, Fastify + zod (fastify-type-provider-zod), Kysely/SQLite, React 19 + TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-multi-unit-hold-design.md` (mockup `docs/design/multi-unit-hold-mockups.html`). ADR-0084 and the ADR-0019 amendment are already written, in the spec's PR.

## Global Constraints

- Every PR changes at most 10 files, generated files included (skill small-prs). Each task below is one PR; if a task comes to more than 10, stop and report rather than exceed it.
- Wishlist authorizes, Item decides, Hold records (ADR-0078). Invariants live in constructors. Counts are derived, never stored, except `purchased_units`, which records a decision.
- Domain error mapping is unchanged: `DomainValidationError` → 400, `ItemUnavailableError` → 409 `item_unavailable`, `HoldLapsedError` → 409 `hold_lapsed`, `HoldNotActiveError` → 409 `hold_not_active`.
- Hold events stay at `v: 1`; migrations are edited in place (`0001_init.ts`). No production holds exist.
- DB CHECKs back up structural invariants only (ADR-0083).
- No plan identifiers (task numbers, "stack", §) in code, comments or test names. Domain instants are `at`, not `now`.
- Regenerate the contract with `npm run gen:api` whenever a route or shared-types schema changes; commit `apps/api/openapi.json` and `apps/web/src/api/schema.gen.ts`.
- Exact copy (web): "How many?", "of N left", "Yes, hold N" / "Yes, hold it", "Only N left now.", "How many did you buy?", "of N held", "Mark N as purchased", "The other N will be released, so another guest can hold it." / "…hold them." (N > 1), "Only N are still free to mark as purchased.", "× N", success "<title>: N marked as purchased. Thank you!" (when the hold covered more than one unit; otherwise the existing message). Stepper buttons are named "One fewer" and "One more".
- Verify with `~/.claude/skills/verifying-gubbins-locally/verify.sh` on a clean tree (`--e2e` for Task 8). Web vitest in the container needs `--testTimeout=30000`.

## Review Focus

1. **Expired hold, fewer units free than held** (hold 3, it lapses, another guest holds 2): `purchasableUnits` is 1, buying 2 is 409 `item_unavailable`, buying 1 succeeds. → Task 1 tests.
2. **Owner lowers quantity below what's committed** (ADR-0019): `availableUnits` stays 0, never negative, with multi-unit holds counted. → Task 1 test.
3. **Replay with a different `units`**: the same idempotency key returns the first hold unchanged. → Task 5 test.
4. **Rebuild from the ledger** keeps `units` and `purchased_units`. → Task 2 test.
5. **Stepper bounds move under the guest** (the list refetches after a 409 and `availableUnits` drops below the chosen count): the count clamps to the new maximum. → Task 7 test.

---

### Task 1: Domain — a hold covers units

**Files:**
- Modify: `apps/api/src/domain/entities/Hold.ts`, `Hold.test.ts`
- Modify: `apps/api/src/domain/entities/Item.ts`, `Item.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, `Wishlist.test.ts`
- Modify: `apps/api/src/domain/events/ItemHeldEvent.ts`, `ItemPurchasedEvent.ts`
- Modify: `apps/api/src/application/test-fakes/builders.ts` (its `ItemHeld` event fixture gains `units: 1`)

**Interfaces — Produces:**
- `Hold.units: number` (readonly), `Hold.purchasedUnits: number | null` (getter).
- `Hold.create({ ...existing, units: number })`. `Hold.reconstitute({ ...existing, units?: number, purchasedUnits?: number | null })`; absent `units` is 1 and absent `purchasedUnits` is `units` when `purchasedAt` is set, else null (the same optional pattern as `piiRef`).
- `Hold.markPurchased(at: Date, units: number): ItemPurchasedEvent`.
- `ItemHeldEvent.units: number`; `ItemPurchasedEvent.units: number` (units bought).
- `Item.placeHold(props: { ...existing, units?: number }, tokens, hasher)`; absent is 1.
- `Item.purchaseHold(hold: Hold, units?: number)`; absent is the hold's `units`.
- `Item.purchasableUnits(hold: Hold): number`; 0 for a hold it didn't load or that can't be purchased. `canPurchaseHold(hold)` stays and is `purchasableUnits(hold) > 0`.
- `Wishlist.holdItem(props: { ...existing, units?: number }, …)`, `Wishlist.purchaseHold(hold: Hold, units?: number)`, `Wishlist.purchasableUnits(hold: Hold): number` (0 when the hold isn't on the list).
- The defaults on `placeHold`/`purchaseHold`/`holdItem` exist only so callers can move over in later PRs; Task 9 removes them.

**Rules (all in constructors or Item):**
- `Hold` constructor: `units` is a positive integer; `purchasedUnits` is null exactly when `purchasedAt` is null; otherwise an integer from 1 to `units`. Each breach is `DomainValidationError`.
- `Hold.markPurchased(at, units)`: `HoldNotActiveError` on a released/purchased hold (as today); `DomainValidationError` unless `units` is an integer from 1 to `this.units`.
- `Item.committedUnits()` = sum of `units` over active holds + sum of `purchasedUnits` over purchased holds. `purchasedCount()` = sum of `purchasedUnits`. Replace `holdsThatAre`'s count with sums.
- `Item.placeHold`: `DomainValidationError` unless `units` is a positive integer; then `ItemUnavailableError` when `units > availableUnits()` (group gifts still refused first).
- One private `purchaseLimit(own: Hold): number` backs `purchasableUnits`, `canPurchaseHold` and `purchaseHold`: active → `own.units`; expired → `Math.min(own.units, availableUnits())`; released/purchased → 0.
- `Item.purchaseHold(hold, units)`, in order: released/purchased → `HoldNotActiveError`; expired with limit 0 → `HoldLapsedError`; `units` not an integer from 1 to `own.units` → `DomainValidationError`; `units > purchaseLimit` → `ItemUnavailableError`; else `own.markPurchased(asOf, units)`.

- [ ] **Step 1: Write failing tests** (names as below; each asserts the numbers it names)
  - Hold: `rejects a hold of 0 units or a fraction of a unit`; `rejects purchased units above the units held`; `rejects purchased units without a purchase, and a purchase without purchased units`; `marks 2 of 3 units purchased and records 2 in the event`; `refuses to mark 4 units purchased on a hold of 3`.
  - Item: `places a hold of 2 units, leaving 3 of 5 available`; `refuses a hold of 3 units when 2 are available`; `refuses a hold of 0 units`; `counts a purchase of 1 of 2 held units as 1 bought and frees the other`; `limits purchasable units on an active hold to the units held`; `limits purchasable units on an expired hold of 3 to the 1 unit still free`; `refuses to buy 2 units of an expired hold when 1 is free (item_unavailable)`; `keeps 0 available when quantity drops below 3 units under one hold`; `purchasable units are 0 for a released hold`.
  - Wishlist: `passes the units of a hold through to the item` (one test; Item owns the rules).
- [ ] **Step 2:** Run `npx vitest run apps/api/src/domain` from `apps/api` — the new tests fail.
- [ ] **Step 3:** Implement the interfaces and rules above. Update the `ItemHeld`/`ItemPurchased` event literals and assertions in the files listed.
- [ ] **Step 4:** Run the domain tests — pass. Run `verify.sh`.
- [ ] **Step 5:** Commit: `feat(domain): a hold covers one or more units`.

### Task 2: Persistence — store and rebuild units

**Files:**
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts`, `apps/api/src/infrastructure/db/schema.ts`
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts`, `WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.ts`, `rebuildProjections.integration.test.ts`
- Modify: `apps/api/src/application/ports/contracts/holdRepository.contract.ts` (or `wishlistRepository.contract.ts`, whichever already round-trips hold lifecycle columns)
- Modify: `apps/api/src/infrastructure/db/schema.integration.test.ts`
- Modify (if the contract needs it): `apps/api/src/application/test-fakes/InMemoryRepositories.ts`

**Interfaces — Consumes:** Task 1's `Hold.units`, `Hold.purchasedUnits`, `Hold.reconstitute({ units, purchasedUnits })`, event `units`.

- Columns: `units INTEGER NOT NULL`, `purchased_units INTEGER` (nullable). CHECKs: `holds_units_positive` (`units >= 1`); `holds_purchased_units_with_purchase` (`(purchased_at IS NULL) = (purchased_units IS NULL)`); `holds_purchased_units_within_units` (`purchased_units IS NULL OR purchased_units BETWEEN 1 AND units`).
- `HoldRepositoryKysely` writes `units` on insert and `purchased_units` with the lifecycle columns, and always passes both to `reconstitute`. `WishlistRepositoryKysely.save` compares `purchased_units` with the other lifecycle columns when deciding what changed.
- `rebuildProjections`: `ItemHeld` inserts `units: event.units`; `ItemPurchased` sets `purchased_units: event.units` with `purchased_at`.

- [ ] **Step 1: Failing tests:** contract `saves and reloads a hold of 3 units with 2 purchased`; rebuild `re-folds units and purchased units from ItemHeld and ItemPurchased`; schema `rejects a hold of 0 units`, `rejects purchased units above the units held`, `rejects purchased units on a hold that is not purchased`.
- [ ] **Step 2:** Run them — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `verify.sh` — passes.
- [ ] **Step 5:** Commit: `feat(api): store a hold's units and units bought`.

### Task 3: Application — the hold view reports units

**Files:** Modify `apps/api/src/application/views/HoldView.ts`, `HoldView.test.ts`.

**Interfaces — Produces:** `HoldView.units: number`, `HoldView.purchasedUnits: number | null`, `HoldView.purchasableUnits: number` (from `wishlist.purchasableUnits(hold)`). `actions.purchase` is unchanged (`canPurchaseHold`).

The wire schema strips the new fields until Task 4; the PR body says so.

- [ ] **Step 1:** Extend the existing `toHoldView` mapping test with `units`, `purchasedUnits` and `purchasableUnits` (a mapping test only; Item owns the numbers).
- [ ] **Step 2–4:** Fail, implement, `verify.sh`.
- [ ] **Step 5:** Commit: `feat(api): the hold view reports units`.

### Task 4: Contract — hold view units on the wire

**Files:**
- Modify: `packages/shared-types/src/holdView.ts`, `holdView.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`
- Modify: web HoldView fixtures in `apps/web/src/api/client.test.ts`, `apps/web/src/features/holds/YourHolds.test.tsx`, `useHoldItem.test.tsx`, `ItemView.test.tsx`, `apps/web/src/pages/ListPage.test.tsx` (add `units: 1, purchasedUnits: null, purchasableUnits: 1` or values matching each fixture's status)

**Interfaces — Produces:** `holdViewSchema` gains `units: z.number().int().min(1)`, `purchasedUnits: z.number().int().min(1).nullable()`, `purchasableUnits: z.number().int().min(0)`.

- [ ] **Step 1:** Failing test in `holdView.test.ts`: `rejects a hold view without units`.
- [ ] **Step 2–4:** Fail, implement, `npm run gen:api`, update fixtures, `verify.sh`.
- [ ] **Step 5:** Commit: `feat(contract): hold views carry units`.

### Task 5: Hold request takes units

**Files:**
- Modify: `packages/shared-types/src/holdItem.ts` (`units: z.number().int().min(1)`, required)
- Modify: `apps/api/src/application/use-cases/HoldItem.ts` (`HoldItemInput.units: number`, passed to `wishlist.holdItem`), `HoldItem.test.ts`
- Modify: `apps/api/src/presentation/routes.ts` (pass `request.body.units`), `routes.integration.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`
- Modify: `apps/web/src/features/holds/ItemView.tsx` (send `units: 1` until the stepper lands in Task 7) and any web test whose hold request body is asserted

- [ ] **Step 1: Failing tests:** use case `holds 2 units and records 2 in ItemHeld`; use case `replays a key with the first hold's units, whatever units the retry sends`; route `rejects a hold request without units, with 0 units, or with 1.5 units` (one `it.each`, 400).
- [ ] **Step 2–4:** Fail, implement, `npm run gen:api`, `verify.sh`.
- [ ] **Step 5:** Commit: `feat(api): a hold request says how many units`.

### Task 6: Purchase request takes units

**Files:**
- Create: `packages/shared-types/src/markHoldPurchased.ts` (`markHoldPurchasedRequestSchema = z.object({ units: z.number().int().min(1) })`, type `MarkHoldPurchasedRequest`); Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/api/src/application/use-cases/MarkHoldPurchased.ts` (input `HoldCommandInput & { units: number }`, passed to `wishlist.purchaseHold`), `MarkHoldPurchased.test.ts`
- Modify: `apps/api/src/presentation/routes.ts`: register purchase on its own with `body: markHoldPurchasedRequestSchema`; extend and release stay in the shared loop. Correct the purchase 409 description: "The hold was already released or purchased (hold_not_active); it expired and no unit is free (hold_lapsed); or fewer units are free than asked (item_unavailable)." `routes.integration.test.ts`.
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`
- Modify: `apps/web/src/api/client.ts`: `markHoldPurchased(slug, holdId, units = 1)` sends `{ units }`. The default is removed in Task 8.

- [ ] **Step 1: Failing tests:** use case `marks 1 of 2 units purchased`; route `rejects a purchase without units` (400) and one success with `{ units: 1 }`.
- [ ] **Step 2–4:** Fail, implement, `npm run gen:api`, `verify.sh`.
- [ ] **Step 5:** Commit: `feat(api): a purchase says how many units were bought`.

### Task 7: Web — stepper in the hold sheet

**Files:**
- Create: `apps/web/src/lib/Stepper.tsx`, `Stepper.test.tsx`
- Modify: `apps/web/src/features/holds/HoldDialog.tsx`, `HoldDialog.test.tsx`
- Modify: `apps/web/src/features/holds/ItemView.tsx`, `ItemView.test.tsx`

**Interfaces — Produces:** `Stepper({ id, label, value, min, max, onChange, disabled, describedBy }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void; disabled?: boolean; describedBy?: string })`. It renders a `role="group"` labelled by `label`, "One fewer"/"One more" buttons (disabled at `min`/`max`), and the value in an `<output aria-live="polite">`. `HoldDialog` gains the prop `availableUnits: number`; `onConfirm(credential, { name, message, units })`.

Behaviour (spec "Hold sheet"):
- The stepper shows only when `availableUnits > 1`. Units start at 1; the count clamps to `availableUnits` whenever that prop drops.
- Copy follows the count (see Global Constraints).
- The count locks with name and message once sent.
- On an `ApiError` with status 409 while `availableUnits >= 1`: show "Only N left now.", unlock (`sent` back to false), and keep the same credential.

- [ ] **Step 1: Failing tests:** Stepper: `steps between 1 and 3 and disables the buttons at each end`. HoldDialog: `shows no stepper when 1 unit is available`; `holds 2 units and says "Yes, hold 2"`; `locks the count once the hold is sent`; `after a 409 with 1 left, says "Only 1 left now." and lets the guest confirm again`. ItemView: `sends the units chosen in the hold sheet`.
- [ ] **Step 2–4:** Fail, implement, `verify.sh`.
- [ ] **Step 5:** Commit: `feat(web): pick how many to hold`.

### Task 8: Web — purchase sheet, "× N", and the e2e journey

**Files:**
- Create: `apps/web/src/features/holds/PurchaseDialog.tsx`, `PurchaseDialog.test.tsx`
- Modify: `apps/web/src/features/holds/HoldActions.tsx`, `useHoldAction.ts` (mutation variables become `{ holdId: string; units?: number }`; purchase passes `units`), `apps/web/src/api/client.ts` (drop the `units = 1` default)
- Modify: `apps/web/src/features/holds/YourHolds.tsx`, `YourHolds.test.tsx`
- Create: `e2e/guest-holds-several.spec.ts`

**Interfaces — Consumes:** `Stepper` (Task 7), `HoldView.units/purchasedUnits/purchasableUnits` (Task 4).

Behaviour (spec "Your holds"):
- "Mark as purchased" on a hold with `units > 1` opens `PurchaseDialog`. With `units === 1`, it marks the hold at once, sending `units: 1`.
- `PurchaseDialog` is a real `<dialog>`, like `HoldDialog`: it can't be dismissed in flight, and focus returns the same way. Its stepper starts at and is capped by `purchasableUnits`.
  - On an active hold, the release note shows while the count is below `units`.
  - On an expired hold where `purchasableUnits < units`, it shows "Only N are still free to mark as purchased." and no release note.
  - After a 409 the list refetches, and the stepper re-caps at the new `purchasableUnits`.
- The card shows "× N" beside the title when `units > 1` (active or expired), or when `purchasedUnits > 1` (purchased).

- [ ] **Step 1: Failing tests:** PurchaseDialog: `starts at 2 of 2 held and says "Mark 2 as purchased"`; `warns that the other 1 will be released when lowered to 1`; `on an expired hold with 1 still free, caps at 1 and shows no release note`. YourHolds: `shows "× 2" for a hold of 2 units`; `opens the purchase sheet only for a hold of more than 1 unit`; `says "Baby onesies: 1 marked as purchased. Thank you!"`. e2e: `a guest holds 2 of 5, buys 1, and another guest sees 4 left`.
- [ ] **Step 2–4:** Fail, implement, `verify.sh --e2e`.
- [ ] **Step 5:** Commit: `feat(web): mark fewer units purchased`.

### Task 9: Domain requires units

**Files:** `apps/api/src/domain/entities/Item.ts`, `Wishlist.ts`, and every caller `git grep` finds of `placeHold(`, `.holdItem(` and `purchaseHold(` that omits units (tests, `test-fakes/scenarios.ts`, contract suites).

Remove the defaults from `Item.placeHold`, `Item.purchaseHold`, `Wishlist.holdItem` and `Wishlist.purchaseHold`; callers pass `units` explicitly. No behaviour change, so there are no new tests. If this exceeds 10 files, split it into one PR for `placeHold`/`holdItem` and one for `purchaseHold`.

- [ ] **Step 1:** Remove the defaults; `npm run build --workspace=apps/api` lists every caller.
- [ ] **Step 2:** Pass `units` at each caller.
- [ ] **Step 3:** `verify.sh` — passes.
- [ ] **Step 4:** Commit: `refactor(domain): hold commands take units explicitly`.
