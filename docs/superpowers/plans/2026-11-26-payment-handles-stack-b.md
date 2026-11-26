# Editing Payment Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner edits the list's Venmo and Zelle handles with the list details; a guest whose dialog shows an old handle is told it changed; one journey proves the owner then sees an old pledge's handle flagged.

**Architecture:** `PaymentMethods.change` keeps a handle's `owner_pii` row id when its text changes, mints one for a new handle and drops a cleared one; `Wishlist.changePaymentMethods` applies it under the rule "a list with a group gift needs a handle", which `addItem` shares. The repository updates, inserts or deletes the list's rows by id. The manage view returns the current handles, the edit request carries them (required, `null` to clear), the form edits them, and the contribute dialog compares its frozen handle with the list's current one.

**Tech Stack:** TypeScript, Kysely on SQLite (`better-sqlite3`), Fastify + Zod (OpenAPI generated, ADR-0077), React + TanStack Query, Vitest, MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-payment-handles-design.md` (steps 4 and 5 of "Order of the work"); ADR-0082 and ADR-0045 as amended, ADR-0090. Builds on the owner_pii stack (#338–#345): `PaymentHandle`, `PaymentMethods.mint`/`reconstitute` with `ListHandle { id; payment }`, `ListHandles`, the dialog's `paidTo`.

## Global Constraints

- At most 10 changed files per PR; 7 PRs, each building on the one before. #338–#345 are already 8 open stacked PRs, so this stack opens only as they merge; its first PR then targets main.
- Every PR passes `scripts/verify.sh`; PR 1 (moves the list's rows), PR 6 (the dialog the pledge journey drives) and PR 7 (the journey) run `--e2e`. One verify at a time.
- No new migration: `owner_pii` and the list's refs exist (0007).
- The edit request's `venmoHandle` and `zelleHandle` are required and nullable, `null` to clear, each `paymentHandleTextSchema` (254); an owner's tab loaded before the deploy gets a 400 until it reloads (accepted in the design).
- Clearing both handles while the list has a group gift is `NoPaymentMethodError` (409 `no_payment_method`); its message becomes "Group gifts need a Venmo or Zelle handle on this list."
- A changed handle replaces the old text in place, a capitalisation-only change included; a cleared handle deletes the list's row; only pledges keep old handles.
- Copy: change notice "The owner's Venmo changed from @old to @new since you started." (Zelle without `@`); removed method "The owner no longer takes Venmo on this list."; choices "I already paid @old" and "Pay @new instead" (or "Pay with Zelle instead" when the method went).
- A change only in a Venmo handle's capitals never notifies a guest (owner ruling, 2026-11-26): Venmo usernames ignore case, as `isCurrent` does.
- No plan IDs in commits, test names or comments.

## Decisions

Approved by the owner (2026-11-26): PR 3 carries the handles while the use case ignores them until PR 4; one 409 message for adding a group gift and clearing both handles; the notice copy above; no length test in the edit form; a capitals-only Venmo change notifies no guest.

Decided in review, for the owner to veto: while the change notice is unanswered the pay link, the Zelle handle and "I've sent it" are held back; step 1 adds the frozen method only when the list no longer offers it; "I already paid" holds until the handle changes again, and a resumed draft whose handle still differs asks again.

## Review Focus

- **Clearing both handles on a list with a group gift** is refused and changes nothing: Task 1's `Wishlist` test.
- **A capitalisation-only Venmo change** replaces the stored text and keeps the row id: Task 1's contract test saves `my-venmo` → `My-Venmo`.
- **A pledge's own `owner_pii` row survives** the list's handle for that method being cleared: Task 1's Kysely test.
- **A guest whose method was removed** while paying can still record the old handle or switch method: Task 6.
- **An owner who only fixes a Venmo handle's capitals** doesn't alarm a paying guest: Task 6.

---

### Task 1: Handles change on the aggregate and in storage (PR 1)

**Files:**
- Modify: `apps/api/src/domain/value-objects/PaymentMethods.ts`, `PaymentMethods.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, `Wishlist.test.ts`
- Modify: `apps/api/src/presentation/domainErrorResponse.ts`, `domainErrorResponse.test.ts` (the message)
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`, `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`
- Test: `apps/api/src/infrastructure/persistence.integration.test.ts`

**Interfaces:**
- Produces: `PaymentMethods.change(raw: { venmoHandle: string | null; zelleHandle: string | null }, ids: { generateEntityId(): string }): PaymentMethods` (both fields required, so a forgotten one can't clear a handle; `Wishlist.changePaymentMethods` takes the same) — per method: blank → none; present before → same id, new `PaymentHandle`; absent before → new id. `Wishlist.paymentMethods` becomes a getter over a private field. `Wishlist.changePaymentMethods(raw, ids): void` throws `NoPaymentMethodError` when the result is empty and the list has a group gift, leaving the old handles; `addItem` uses the same private rule for a group gift.
- `WishlistRepositoryKysely.save` compares the stored refs with the domain's per method: cleared → null the ref, then delete the row; added → insert the row, then set the ref; same id, other text → update the row's `handle`. Pledge rows are never touched.

- [ ] **Step 1: Failing tests.**
  - `PaymentMethods.test.ts`: "gives a changed handle its old row id" (protects the keep-id branch); "mints a row id for a handle the list did not have"; "drops a handle cleared to blank".
  - `Wishlist.test.ts`: "refuses to clear both handles while the list has a group gift, and the old handles stay" (protects the shared rule in `changePaymentMethods`); "lets an owner clear both handles on a list without a group gift". The existing addItem refusal stays as is.
  - `domainErrorResponse.test.ts`: the `NoPaymentMethodError` row's message.
  - Wishlist contract: "saves a handle changed only in capitals in place, under the same row id" (`my-venmo` → `My-Venmo`; protects the save's text comparison, the one line that could drop a capitals-only change); "saves an added handle under its new row id"; "saves a cleared handle as none".
  - `persistence.integration.test.ts`: "deletes a cleared handle's owner_pii row, and a pledge's row for that method survives" (SQLite only: the contract can't see the table).
- [ ] **Step 2: Run** `scripts/verify.sh --quick apps/api src/domain` and the two infrastructure files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** `scripts/verify.sh --e2e`; **commit** `feat: an owner's payment handles change on the list`. The PR body names PR 4 as `changePaymentMethods`' first caller.

### Task 2: The manage view returns the current handles (PR 2)

**Files:**
- Modify: `packages/shared-types/src/listView.ts` (exports the payment object as `paymentHandlesSchema`), `manageView.ts`, `apps/api/src/application/use-cases/GetManageView.ts`, `GetManageView.test.ts`
- Modify (fixtures typed by the response): `apps/web/src/features/manage/ListDetails.test.tsx`, `ManageItems.test.tsx`, `apps/web/src/pages/ManagePage.test.tsx`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces: `manageViewResponseSchema.payment: paymentHandlesSchema`, the one shape both views use. Its first web reader is PR 3; the body says so.

- [ ] **Step 1:** `GetManageView.test.ts`'s exact-payload test gains `payment: { venmoHandle: 'my-venmo', zelleHandle: null }` and becomes "shows the owner the list, its style, its key, its payment handles and each item with what editing needs" — FAIL.
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
- Modify: `apps/api/src/presentation/compositionRoot.ts` (passes the token generator), `apps/api/src/presentation/routes.ts` (the PUT's 409 `no_payment_method` response, described without an ADR), `openApiDocument.test.ts` (its pinned statuses and response-description count), `routes.integration.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Consumes: Task 1's `changePaymentMethods`, Task 3's request.
- Produces: `EditListDetails(unitOfWork, tokenGenerator, clock)`; `EditListDetailsInput` gains `venmoHandle: string | null; zelleHandle: string | null`, applied with `wishlist.changePaymentMethods`.

- [ ] **Step 1:** `EditListDetails.test.ts`'s "saves the owner's edit" also changes the Venmo handle and asserts the reloaded handle — FAIL.
- [ ] **Step 2: Add** `routes.integration.test.ts`: "answers 409 no_payment_method when the owner clears both handles on a list with a group gift" (the route's one error that reaches the mapping). **Implement.**
- [ ] **Step 3: Verify** `scripts/verify.sh`; **commit** `feat: the owner changes payment handles with the list details`

### Task 5: The form edits the handles (PR 5)

**Files:**
- Create: `apps/web/src/lib/paymentHandleFields.ts` (`VENMO_MAX = 31`, `ZELLE_MAX = 254` and their why-comment, moved from `CreateListForm.tsx`, and `HANDLES_HINT = 'Group gifts need at least one handle.'`)
- Modify: `apps/web/src/features/manage/EditListDetailsForm.tsx`, `EditListDetailsForm.test.tsx`
- Modify: `apps/web/src/features/create-list/CreateListForm.tsx`, `CreateListForm.test.tsx` (the hint loses "Handles can't be changed later.")
- Modify: `apps/web/src/pages/PrivacyPage.tsx`

**Interfaces:**
- Produces: "Venmo username" and "Zelle email or US phone" fields, prefilled from `payment`, trimmed, blank sent as `null`, with the create form's hint "Group gifts need at least one handle."

- [ ] **Step 1: Failing tests.** `EditListDetailsForm.test.tsx`: "starts with the list's handles and sends them trimmed, with null for one cleared to blank" (protects prefill, trim and blank → null). No length test here: both forms use the shared constants, and `CreateListForm.test.tsx`'s "…the Venmo username to 31 and the Zelle handle to 254" pins them. Add "describes both handle fields with the group-gift hint". `CreateListForm.test.tsx`: the hint test becomes "explains that group gifts need a handle" with the new text.
- [ ] **Step 2: Implement.** Privacy page: past handles are kept only as part of the pledges that named them, and changing a handle replaces it; nothing says handles "go with the list".
- [ ] **Step 3: Verify** `scripts/verify.sh`; **commit** `feat: the owner edits payment handles in the list details form`

### Task 6: The dialog says when the handle changed (PR 6)

**Files:**
- Modify: `apps/web/src/features/contribute/ContributeDialog.tsx`, `ContributeDialog.test.tsx`

**Interfaces:**
- Consumes: the frozen `paidTo` and `current(method)`.
- Produces: on the pay step, when `current(paidTo.method).handle` differs from `paidTo.handle` (a refetch, or a resumed draft), ignoring capitals for Venmo, a notice with two choices. "I already paid @old" hides the notice and keeps `paidTo`; "Pay @new instead" sets `paidTo` to the current pair. When the list no longer offers `paidTo.method`, the second choice switches to the other offered method (a list with a group gift always has one). While the notice is unanswered, the pay link and the Zelle handle are hidden, so the guest can't pay the old handle twice. "I've sent it" is disabled until the notice is answered, so the pledge records the handle the guest says they paid. Step 1 of "How to chip in" still names the list's methods, adding `paidTo`'s method only when the list no longer offers it. "I already paid" records the current handle it was answered for: a later, different change shows the notice again, and a resumed draft shows it again if the handle still differs.

- [ ] **Step 1: Failing tests.** "says the owner's Venmo changed since the pay step opened"; "says nothing when only the Venmo handle's capitals changed" (protects the case-insensitive comparison); "sends the old handle once the guest says they already paid it"; "sends the new handle once the guest chooses to pay it"; "offers Zelle when the owner removed Venmo while the guest was paying"; "hides the pay link, and holds back \"I've sent it\", until the guest answers the notice"; "says so again when the handle changes a second time after \"I already paid\"" (protects recording the answered handle, not a flag). The notice region is mounted empty and filled, as ListPage's alert is.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify** `scripts/verify.sh --e2e`; **commit** `feat: the chip-in dialog says when the owner's handle changed`

### Task 7: One journey (PR 7)

**Files:**
- Modify: `e2e/guest-pledges.spec.ts` (the journey continues past the pledge)

- [ ] **Step 1: Extend** the existing journey and rename it "a guest covers a group gift with Venmo, the owner changes the handle, and the gift details flag the old one": after the pledge, the owner edits the Venmo handle to `new-venmo`, presses "Show who gave what" and sees "via Venmo to @my-venmo (not your current handle)". Axe scan of the edit form, as the other journeys do.
- [ ] **Step 2: Verify** `scripts/verify.sh --e2e`; **commit** `test: a journey through changing a payment handle`
