# Message at purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The guest's optional message to the owner is collected when a hold is marked purchased, not when it is placed, and every message already stored on a hold is deleted.

**Architecture:** The message stays on the hold's existing `guest_pii` row (never in an event). `MarkHoldPurchased` rewrites that row through a new `GuestPiiRepository.update`, validating via `GuestDetails`. The web `PurchaseDialog` opens for every purchase and gains the message box; `HoldDialog` loses it. A one-time migration clears hold messages.

**Tech Stack:** TypeScript, Fastify + zod, Kysely/SQLite, React + TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-purchase-message-design.md`

## Global Constraints

- Every PR ≤ 10 changed files, generated files included (skill small-prs). Stack: Task 1 → 2 → 3 → 4 → 5, each a PR on the one below. Task 6 is its own PR off main after PR #206 merges.
- Message rules: trimmed; blank means `null`; at most 300 characters; owned by `GuestDetails` only. No DB length CHECK.
- Label copy, exactly: `Message to the owner (optional)`. One-unit sheet title: `Mark “{item title}” as purchased?`. Buttons: `Mark as purchased`, `Cancel`.
- The hold request stays a non-strict zod object: an unknown `message` is stripped, never a 400.
- No plan identifiers in test names or comments. Domain instants are named `at`.
- Before each push: skill verifying-gubbins-locally (`--e2e` for PRs targeting main). Web vitest in the dev container needs `--testTimeout=30000`. At most 3 verify runs in parallel; announce e2e runs to peer sessions.
- PR bodies: skill writing-pr-descriptions. Self-review: skill reviewing-for-recurring-feedback.

## Review Focus

1. A browser on the previous build sends `message` with a hold: the hold succeeds (201) and stores no message. Test in Task 5.
2. A whitespace-only message at purchase is stored as `null`, not `"   "`. Test in Task 2.
3. A 301-character message at purchase: 400, and the hold is still active (nothing purchased). Test in Task 2.
4. A hold with no `guest_pii` row (`piiRef` null) is purchased with a message: the purchase succeeds and the message is dropped. Test in Task 2.
5. A purchase refused with 409 `item_unavailable`: the sheet stays open and the typed message is still in the box. Test in Task 3.

---

### Task 1: `GuestPiiRepository.update`

**Files:**
- Modify: `apps/api/src/application/ports/GuestPiiRepository.ts`
- Modify: `apps/api/src/application/ports/contracts/guestPiiRepository.contract.ts`
- Modify: `apps/api/src/infrastructure/GuestPiiRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts` (`InMemoryGuestPiiRepository`)

**Interfaces:**
- Produces: `update(id: string, details: GuestDetails): Promise<void>` on `GuestPiiRepository`. Replaces the row's `name` and `message`; leaves `created_at` and `redacted_at` alone. Throws if no row has that id.

- [ ] **Step 1: Add contract tests** in `describeGuestPiiRepositoryContract`:
  - `it('replaces the name and message of an existing row')`: insert `pii-1` as `{ name: 'Ada' }`, `update('pii-1', GuestDetails.from({ name: 'Ada', message: 'Congratulations!' }))`, expect `findById('pii-1')` to equal the updated details.
  - `it('refuses to update an unknown id')`: `await expect(fx.guestPii.update('missing', GuestDetails.from({ name: 'Ada' }))).rejects.toThrow()`.
- [ ] **Step 2: Run** `npm test --workspace=apps/api -- guestPii contracts` and see both fail (method missing).
- [ ] **Step 3: Implement** `update` in the port, the Kysely adapter (throw when `numUpdatedRows` is 0) and the in-memory fake (throw when the id is missing).
- [ ] **Step 4: Run** the same command; expect PASS for both adapters.
- [ ] **Step 5: Commit** `feat(api): guest details can be updated in place`.

### Task 2: Marking purchased takes the message

**Files:**
- Modify: `packages/shared-types/src/holdView.ts` (`markHoldPurchasedRequestSchema`)
- Modify: `apps/api/src/application/use-cases/MarkHoldPurchased.ts`
- Modify: `apps/api/src/application/use-cases/MarkHoldPurchased.test.ts`
- Modify: `apps/api/src/presentation/routes.ts` (purchase route passes `request.body.message`)
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (`npm run gen:api`)

**Interfaces:**
- Consumes: `GuestPiiRepository.update` (Task 1), `ctx.guestPii.findById`.
- Produces: `markHoldPurchasedRequestSchema = z.object({ units: z.number().int().min(1), message: z.string().optional() })`. `MarkHoldPurchased.execute(input: HoldCommandInput & { units: number; message?: string }, access)`.

- [ ] **Step 1: Write failing use-case tests** in `MarkHoldPurchased.test.ts`:
  - `it('stores the message on the hold\'s guest details')`: hold as `Ada`, purchase with `message: '  Congratulations!  '`, expect the store's guest_pii row `{ name: 'Ada', message: 'Congratulations!' }`.
  - `it('stores no message when the message is blank')`: `message: '   '` → row message `null`.
  - `it('purchases nothing when the message is over 300 characters')`: `message: 'x'.repeat(301)` → rejects with `DomainValidationError`; the hold's status is still `active` and no `ItemPurchased` event is stored.
  - `it('purchases a hold with no guest details and drops the message')`: hold seeded with `piiRef: null`, purchase with a message → resolves with `status: 'purchased'`; guest_pii store stays empty.
- [ ] **Step 2: Run** `npm test --workspace=apps/api -- MarkHoldPurchased`; expect the four to fail.
- [ ] **Step 3: Implement.** In the unit of work, after `runHoldCommand` succeeds, when `hold.piiRef` is set: `findById`, then `update(piiRef, GuestDetails.from({ name: existing.name, message: input.message }))`. Validate (build the `GuestDetails`) before the purchase is persisted so an over-long message purchases nothing; the hold is reachable via `ctx.wishlists.findById(...).findHold(holdId)` or by building the details inside the `decide` callback — implementer's choice, as long as one transaction covers both.
- [ ] **Step 4: Route test** in `routes.integration.test.ts`: `it('passes the message from the purchase body to the hold\'s guest details')` — hold as `Ada`, POST purchase `{ units: 1, message: 'Congrats' }`, expect 200 and guest_pii `[{ name: 'Ada', message: 'Congrats' }]`. Wire `message: request.body.message` in the route.
- [ ] **Step 5: Run** `npm run gen:api`, then `npm test --workspace=apps/api`; expect PASS.
- [ ] **Step 6: Commit** `feat(api): the message to the owner is given when marking purchased`.

### Task 3: The purchase sheet opens for every purchase and takes the message

**Files:**
- Modify: `apps/web/src/api/client.ts` (`markHoldPurchased(slug, holdId, units, message)`)
- Modify: `apps/web/src/features/holds/useHoldAction.ts` (`purchase: { holdId; units; message: string }`)
- Modify: `apps/web/src/features/holds/PurchaseDialog.tsx`, `PurchaseDialog.test.tsx`
- Modify: `apps/web/src/features/holds/HoldActions.tsx`, `HoldActions.test.tsx`
- Modify: `e2e/guest-manages-a-hold.spec.ts`

**Interfaces:**
- Consumes: the regenerated client types from Task 2.
- Produces: `PurchaseDialogProps` gains `itemTitle: string`; `onConfirm: (units: number, message: string) => void` (message trimmed by the dialog, as `HoldDialog` trims today).

- [ ] **Step 1: Failing `PurchaseDialog` tests:**
  - `it('for one unit held, asks "Mark “Stroller” as purchased?" with no stepper or release note')`: `units: 1, purchasableUnits: 1` → heading text as given, no `spinbutton`/stepper, button `Mark as purchased`.
  - `it('sends the trimmed message with the count')`: type `'  Congrats  '` into `Message to the owner (optional)`, confirm → `onConfirm(1, 'Congrats')`.
  - `it('locks the message box while the purchase is in flight')`: `isPending: true` → textbox disabled.
  - Existing multi-unit tests keep passing; the box sits under the count.
- [ ] **Step 2: Failing `HoldActions` tests:**
  - `it('opens the purchase sheet for a one-unit hold instead of purchasing at once')`: click `Mark as purchased` → dialog shown, no request sent yet.
  - `it('keeps the typed message when the purchase is refused as unavailable')`: 409 `item_unavailable` with a unit still free → dialog still open, textbox value unchanged.
- [ ] **Step 3: Run** `npm test --workspace=apps/web -- --testTimeout=30000 PurchaseDialog HoldActions`; expect failures.
- [ ] **Step 4: Implement.** `HoldActions`: "Mark as purchased" always calls `openPurchaseSheet()`; `buy(units, message)` sends both. Keep today's close/keep-open rules unchanged (spec, Anti-goals). `PurchaseDialog`: render `Stepper` and the release note only when `units > 1`; use `LimitedTextarea` with `max={300}` like `HoldDialog`.
- [ ] **Step 5: e2e.** In `a guest holds the item, extends the hold once, and marks it purchased`, after clicking `Mark as purchased`: fill `Message to the owner (optional)` with `Congratulations!`, run `expectNoSeriousAxeViolations`, click the dialog's `Mark as purchased`. The remaining assertions stay.
- [ ] **Step 6: Run** web tests and `npx playwright test e2e/guest-manages-a-hold.spec.ts e2e/guest-holds-several.spec.ts`; expect PASS.
- [ ] **Step 7: Commit** `feat(web): the purchase sheet asks for the message to the owner`.

### Task 4: The hold sheet stops asking for a message

**Files:**
- Modify: `apps/web/src/features/holds/HoldDialog.tsx`, `HoldDialog.test.tsx`
- Modify: `apps/web/src/features/holds/ItemView.test.tsx`

**Interfaces:**
- Produces: `HoldDialog`'s `onConfirm(credential, details: { name: string; units: number })`.

- [ ] **Step 1: Tests.** `HoldDialog.test.tsx`: `it('asks for the gifter name only')` → no element labelled `Message to the owner (optional)`. Remove message typing from existing tests. `ItemView.test.tsx`: the first test's expected body becomes `{ idempotencyKey: expect.any(String), name: 'Amara', units: 1 }`.
- [ ] **Step 2: Run** `npm test --workspace=apps/web -- --testTimeout=30000 HoldDialog ItemView`; expect failures.
- [ ] **Step 3: Implement**: remove `message` state, the label/box and `MESSAGE_MAX` from `HoldDialog`; update its doc comment.
- [ ] **Step 4: Run** the web tests; expect PASS.
- [ ] **Step 5: Commit** `feat(web): holding an item no longer asks for a message`.

### Task 5: The hold request drops `message`

**Files:**
- Modify: `packages/shared-types/src/holdItem.ts` (remove `message`)
- Modify: `apps/api/src/application/use-cases/HoldItem.ts`, `HoldItem.test.ts`
- Modify: `apps/api/src/presentation/routes.ts`, `routes.integration.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

- [ ] **Step 1: Tests.** `HoldItem.test.ts`: the test that stored `'Congrats'` becomes `it('stores the holder\'s name with no message')` → rows `[{ id: expect.any(String), name: 'Ada', message: null }]`. `routes.integration.test.ts`: rename `passes the name, message and units from the body to the hold` to `passes the name and units from the body to the hold, and ignores a message`: keep sending `message: 'Congrats'`, expect 201 and guest_pii `[{ name: 'Ada', message: null }]`.
- [ ] **Step 2: Run** `npm test --workspace=apps/api -- HoldItem routes`; expect failures.
- [ ] **Step 3: Implement**: drop `message` from the schema, `HoldItemInput` and the route call; `GuestDetails.from({ name: input.name })`.
- [ ] **Step 4: Run** `npm run gen:api` and the full `npm test`; expect PASS.
- [ ] **Step 5: Commit** `feat(api): a hold takes no message`.

### Task 6: Delete stored hold messages (after PR #206 merges)

**Files:**
- Create: `apps/api/src/infrastructure/db/migrations/0002_clear_hold_messages.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/index.ts` (add `'0002_clear_hold_messages'`)
- Create: `apps/api/src/infrastructure/db/clearHoldMessages.integration.test.ts`

**Interfaces:**
- Consumes: the `migrations` record and `Migrator` from PR #206.
- Produces: `up(db: Kysely<unknown>)` running `UPDATE guest_pii SET message = NULL WHERE id IN (SELECT pii_ref FROM holds WHERE pii_ref IS NOT NULL)`. No `down`.

- [ ] **Step 1: Failing test** `it('clears every hold\'s message and keeps pledge messages')`: migrate to `0001_init` only, insert a list, an item, a hold whose guest_pii row has `message: 'Congrats'` and a contribution whose row has `message: 'Chipping in'`; migrate to latest; expect the hold row's message `null` and the pledge row's `'Chipping in'`.
- [ ] **Step 2: Run** `npm test --workspace=apps/api -- clearHoldMessages`; expect FAIL.
- [ ] **Step 3: Implement** the migration and register it.
- [ ] **Step 4: Run** the full `npm test`; expect PASS (including #206's schema-match and shipped-migration checks).
- [ ] **Step 5: Commit** `feat(api): delete the messages stored on holds`.
