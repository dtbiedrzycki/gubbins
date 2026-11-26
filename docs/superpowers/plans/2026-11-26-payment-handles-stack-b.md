# Editing Payment Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner edits the list's Venmo and Zelle handles with the list details; a guest whose dialog shows an old handle is told it changed; one journey proves the owner then sees an old pledge's handle flagged.

**Architecture:** `PaymentMethods.change` keeps a handle's `owner_pii` row id when its text changes, mints one for a new handle and drops a cleared one; `Wishlist.changePaymentMethods` applies it under the rule "a list with a group gift needs a handle", which `addItem` shares. The repository updates, inserts or deletes the list's rows by id. The manage view returns the current handles, the edit request carries them (required, `null` to clear), the form edits them, and the contribute dialog compares its frozen handle with the list's current one.

**Tech Stack:** TypeScript, Kysely on SQLite (`better-sqlite3`), Fastify + Zod (OpenAPI generated, ADR-0077), React + TanStack Query, Vitest, MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-payment-handles-design.md` (steps 4 and 5 of "Order of the work"); ADR-0082 and ADR-0045 as amended, ADR-0090. Builds on the owner_pii stack (#338–#345): `PaymentHandle`, `PaymentMethods.mint`/`reconstitute` with `ListHandle { id; payment }`, `ListHandles`, the dialog's `paidTo`.

## Global Constraints

- At most 10 changed files per PR; 7 PRs, each building on the one before; the first builds on #345 and, once stack A merges, targets main.
- Every PR passes `scripts/verify.sh`; PR 1 (moves the list's rows) and PR 7 (the journey) run `--e2e`. One verify at a time.
- No new migration: `owner_pii` and the list's refs exist (0007).
- The edit request's `venmoHandle` and `zelleHandle` are required and nullable, `null` to clear, each `paymentHandleTextSchema` (254); an owner's tab loaded before the deploy gets a 400 until it reloads (accepted in the design).
- Clearing both handles while the list has a group gift is `NoPaymentMethodError` (409 `no_payment_method`); its message becomes "Group gifts need a Venmo or Zelle handle on this list."
- A changed handle replaces the old text in place, a capitalisation-only change included; a cleared handle deletes the list's row; only pledges keep old handles.
- Copy: change notice "The owner's Venmo changed from @old to @new since you started." (Zelle without `@`); removed method "The owner no longer takes Venmo on this list."; choices "I already paid @old" and "Pay @new instead" (or "Pay with Zelle instead" when the method went).
- No plan IDs in commits, test names or comments.

## Review Focus

- **Clearing both handles on a list with a group gift** is refused and changes nothing: Task 1's `Wishlist` test.
- **A capitalisation-only Venmo change** replaces the stored text and keeps the row id: Task 1's `PaymentMethods` test.
- **An edit that leaves the handles as they were** keeps both row ids: the contract test in Task 1 reloads after a title-only save.
- **A pledge's own `owner_pii` row survives** the list's handle for that method being cleared: Task 1's Kysely test.
- **A guest whose method was removed** while paying can still record the old handle or switch method: Task 6.

---

### Task 1: Handles change on the aggregate and in storage (PR 1)

**Files:**
- Modify: `apps/api/src/domain/value-objects/PaymentMethods.ts`, `PaymentMethods.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, `Wishlist.test.ts`
- Modify: `apps/api/src/presentation/domainErrorResponse.ts`, `domainErrorResponse.test.ts` (the message)
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`, `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`
- Test: `apps/api/src/infrastructure/persistence.integration.test.ts`

**Interfaces:**
- Produces: `PaymentMethods.change(raw: ListHandles, ids: { generateEntityId(): string }): PaymentMethods` — per method: blank → none; present before → same id, new `PaymentHandle`; absent before → new id. `Wishlist.paymentMethods` becomes a getter over a private field. `Wishlist.changePaymentMethods(raw: ListHandles, ids): void` throws `NoPaymentMethodError` when the result is empty and the list has a group gift, leaving the old handles; `addItem` uses the same private rule for a group gift.
- `WishlistRepositoryKysely.save` compares the stored refs with the domain's per method: cleared → null the ref, then delete the row; added → insert the row, then set the ref; same id, other text → update the row's `handle`. Pledge rows are never touched.

- [ ] **Step 1: Failing tests.**
  - `PaymentMethods.test.ts`: "keeps a handle's row id when its text changes, capitals included" (`my-venmo` → `My-Venmo`; protects the keep-id branch); "mints a row id for a handle the list did not have"; "drops a handle cleared to blank".
  - `Wishlist.test.ts`: "refuses to clear both handles while the list has a group gift, keeping the old ones" (protects the shared rule in `changePaymentMethods`); "lets an owner clear both handles on a list without a group gift". The existing addItem refusal stays as is.
  - `domainErrorResponse.test.ts`: the `NoPaymentMethodError` row's message.
  - Wishlist contract: "saves a changed handle in place, under the same row id"; "saves an added handle under its new row id"; "saves a cleared handle as none"; "keeps both row ids when a save leaves the handles as they were" (title-only edit).
  - `persistence.integration.test.ts`: "deletes a cleared handle's owner_pii row and keeps a pledge's" (SQLite only: the contract can't see the table).
- [ ] **Step 2: Run** `scripts/verify.sh --quick apps/api src/domain` and the two infrastructure files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** `scripts/verify.sh --e2e`; **commit** `feat: an owner's payment handles change on the list`

### Task 2: The manage view returns the current handles (PR 2)

**Files:**
- Modify: `packages/shared-types/src/manageView.ts`, `apps/api/src/application/use-cases/GetManageView.ts`, `GetManageView.test.ts`
- Modify (fixtures typed by the response): `apps/web/src/features/manage/ListDetails.test.tsx`, `ManageItems.test.tsx`, `apps/web/src/pages/ManagePage.test.tsx`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces: `manageViewResponseSchema.payment: { venmoHandle: string | null; zelleHandle: string | null }`, as the guest list view has it.

- [ ] **Step 1:** `GetManageView.test.ts`'s existing exact-payload test gains `payment: { venmoHandle: 'my-venmo', zelleHandle: null }` — FAIL.
- [ ] **Step 2: Implement; regenerate; add `payment` to the three fixtures.**
- [ ] **Step 3: Verify** `scripts/verify.sh`; **commit** `feat: the manage view shows the list's payment handles`

### Task 3: The edit request carries the handles (PR 3)

**Files:**
- Modify: `packages/shared-types/src/ownerEditing.ts`, `ownerEditing.test.ts`
- Modify: `apps/web/src/features/manage/EditListDetailsForm.tsx`, `EditListDetailsForm.test.tsx`, `ListDetails.tsx` (passes `view.payment`)
- Modify: `apps/api/src/presentation/routes.integration.test.ts` (the three `PUT /api/lists/:slug` payloads add `venmoHandle: null, zelleHandle: null`)
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces: `editListDetailsRequestSchema` gains `venmoHandle: paymentHandleTextSchema.nullable()`, `zelleHandle: paymentHandleTextSchema.nullable()`. `EditListDetailsForm` takes `payment: ManageViewResponse['payment']` and sends it unchanged. The use case ignores the fields until Task 4; the PR body says so.

- [ ] **Step 1: Failing tests.** `ownerEditing.test.ts`: the existing "requires the description, with null to clear it…" becomes an `it.each` over `description`, `venmoHandle`, `zelleHandle`. `EditListDetailsForm.test.tsx`: both `bodies` assertions include the handles it was given.
- [ ] **Step 2: Implement; regenerate.**
- [ ] **Step 3: Verify** `scripts/verify.sh`; **commit** `feat: the list details request carries the payment handles`

### Task 4: Editing the list details changes the handles (PR 4)

**Files:**
- Modify: `apps/api/src/application/use-cases/EditListDetails.ts`, `EditListDetails.test.ts`
- Modify: `apps/api/src/presentation/compositionRoot.ts` (passes the token generator), `apps/api/src/presentation/routes.ts` (the PUT's 409 `no_payment_method` response, described without an ADR)
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Consumes: Task 1's `changePaymentMethods`, Task 3's request.
- Produces: `EditListDetails(unitOfWork, tokenGenerator, clock)`; `EditListDetailsInput` gains `venmoHandle: string | null; zelleHandle: string | null`, applied with `wishlist.changePaymentMethods`.

- [ ] **Step 1:** `EditListDetails.test.ts`'s "saves the owner's edit" also changes the Venmo handle and asserts the reloaded handle — FAIL.
- [ ] **Step 2: Implement.** No route test: the 409's mapping is pinned in `domainErrorResponse.test.ts`.
- [ ] **Step 3: Verify** `scripts/verify.sh`; **commit** `feat: the owner changes payment handles with the list details`

### Task 5: The form edits the handles (PR 5)

**Files:**
- Create: `apps/web/src/lib/paymentHandleLimits.ts` (`VENMO_MAX = 31`, `ZELLE_MAX = 254` and their why-comment, moved from `CreateListForm.tsx`)
- Modify: `apps/web/src/features/manage/EditListDetailsForm.tsx`, `EditListDetailsForm.test.tsx`
- Modify: `apps/web/src/features/create-list/CreateListForm.tsx`, `CreateListForm.test.tsx` (the hint loses "Handles can't be changed later.")
- Modify: `apps/web/src/pages/PrivacyPage.tsx`

**Interfaces:**
- Produces: "Venmo username" and "Zelle email or US phone" fields, prefilled from `payment`, trimmed, blank sent as `null`, with the create form's hint "Group gifts need at least one handle."

- [ ] **Step 1: Failing tests.** `EditListDetailsForm.test.tsx`: "starts with the list's handles and sends them trimmed, with null for one cleared to blank" (protects prefill, trim and blank → null). No length test here: both forms use the shared constants, and `CreateListForm.test.tsx`'s "…the Venmo username to 31 and the Zelle handle to 254" pins them. `CreateListForm.test.tsx`: the hint test's text.
- [ ] **Step 2: Implement.** Privacy page: past handles are kept only as part of the pledges that named them, and changing a handle replaces it; nothing says handles "go with the list".
- [ ] **Step 3: Verify** `scripts/verify.sh`; **commit** `feat: the owner edits payment handles in the list details form`

### Task 6: The dialog says when the handle changed (PR 6)

**Files:**
- Modify: `apps/web/src/features/contribute/ContributeDialog.tsx`, `ContributeDialog.test.tsx`

**Interfaces:**
- Consumes: the frozen `paidTo` and `current(method)`.
- Produces: on the pay step, when `current(paidTo.method).handle` differs from `paidTo.handle` (a refetch, or a resumed draft), a notice with two choices. "I already paid @old" hides the notice and keeps `paidTo`; "Pay @new instead" sets `paidTo` to the current pair. When the list no longer offers `paidTo.method`, the second choice switches to the other offered method, or is absent if none.

- [ ] **Step 1: Failing tests.** "says the owner's Venmo changed since the pay step opened"; "keeps sending the old handle once the guest says they already paid it"; "sends the new handle once the guest chooses to pay it"; "offers Zelle when the owner removed Venmo while the guest was paying". The notice region is mounted empty and filled, as ListPage's alert is.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify** `scripts/verify.sh`; **commit** `feat: the chip-in dialog says when the owner's handle changed`

### Task 7: One journey (PR 7)

**Files:**
- Create: `e2e/owner-changes-a-handle.spec.ts`

- [ ] **Step 1: Write** "a guest pledges by Venmo, the owner changes the handle, and the gift details flag the old one": create a list with `my-venmo`, add a group gift, a guest chips in by Venmo, the owner edits the Venmo handle to `new-venmo`, presses "Show who gave what" and sees "via Venmo to @my-venmo (not your current handle)". Axe scan of the edit form, as the other journeys do.
- [ ] **Step 2: Verify** `scripts/verify.sh --e2e`; **commit** `test: a journey through changing a payment handle`
