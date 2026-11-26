# Owner PII and Each Pledge's Method Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move a list's Venmo and Zelle handles into an `owner_pii` table, and have every pledge the dialog sends record the method and handle the guest paid, shown to the owner in the gift details.

**Architecture:** Migration `0007` creates `owner_pii` and moves the list's handles there; the wishlist references its rows, and the aggregate mints their ids. A pledge's reported `{ method, handle }` is a `PaymentHandle` stored in its own `owner_pii` row, minted by the pledge use case beside the insert (ADR-0090). Events carry only `ownerPiiRef`. The dialog freezes the handle it shows and sends it; the gift details compare it with the list's current handle.

**Tech Stack:** TypeScript, Kysely on SQLite (`better-sqlite3`), Fastify + Zod (OpenAPI generated, ADR-0077), React + TanStack Query, Vitest, MSW.

**Spec:** `docs/superpowers/specs/2026-11-24-payment-handles-design.md` (step 3 of "Order of the work"); ADR-0090, and ADR-0045 and ADR-0082 as amended.

## Global Constraints

- At most 10 changed files per PR, generated files and tests included; 8 PRs, each building on the one before; PR 1 targets main.
- Every PR passes `scripts/verify.sh` on its own; PRs 1 (targets main), 2 (moves the handles the journeys create) and 8 (rewrites the dialog the pledge journey drives) run `--e2e`. One verify at a time.
- Shipped migrations `0001`–`0006` are never edited (ADR-0085); this stack adds `0007_owner_pii` only.
- `ContributionPledged` stays `v: 1`; it gains an optional `ownerPiiRef`. `piiRef` keeps its name.
- Handle checks are the existing ones, unchanged: Venmo `^[A-Za-z0-9_-]{5,30}$` after an optional leading `@`; Zelle an email (lower-cased) or a US phone (stored `+1` and 10 digits). Messages stay "Venmo handle must be 5 to 30 letters, digits, "_" or "-"" and "Zelle handle must be an email or a US phone number".
- A pledge's `payment.handle` is capped at 254 in the request schema, like the create request; no other schema limits text.
- DB CHECKs are structural only (ADR-0083): `owner_pii.method IN ('venmo', 'zelle')`.
- Copy: card "Sam · $40.00 via Venmo to @handle", "(not your current handle)", "method not recorded"; removed gift "A gift you were paying for was removed. If you already sent money, let the owner know."; funded gift "Others finished funding this gift while you were paying. If you already sent money, record it here."
- No plan IDs in commits, test names or comments.

## Review Focus

- **A live database with handles migrates intact:** each list's Venmo and Zelle handle becomes an `owner_pii` row the list references, and a list with neither gets no rows. Task 2's migration test.
- **A replayed "I've sent it" with a payment writes no second `owner_pii` row:** the replay check runs before the insert. Task 6 sends the payment in the existing replay test.
- **A malformed reported handle records nothing:** no contribution, event or `owner_pii` row. Task 6.
- **A Venmo handle reported in other capitals is still current** (Venmo usernames ignore case). Task 7's `isCurrent` test.
- **Events from before this rebuild:** a `ContributionPledged` without `ownerPiiRef` rebuilds with a null `owner_pii_ref`. The existing "re-folds exactly the state the write path maintained incrementally" covers it.

## Owner-approved decisions

- **No erased-handle state yet.** `owner_pii.handle` is `NOT NULL` and the gift details' `handle` is a string, as `guest_pii.name` is today; the erasure work makes both nullable and adds "(handle removed)". The design has them nullable now.
- **Task 2 mints the new list's row ids in the repository for one PR.** The domain can't carry row ids before the rows exist, and doing both in one PR is 13 files. Task 3 moves the minting into `Wishlist.create`.

---

### Task 1: A `PaymentHandle` value object (PR 1, targets main)

**Files:**
- Create: `apps/api/src/domain/value-objects/PaymentHandle.ts`, `PaymentHandle.test.ts`
- Modify: `apps/api/src/domain/value-objects/PaymentMethods.ts` (its `venmo`/`zelle` functions go; `from` calls `PaymentHandle.from` for each non-blank handle), `PaymentMethods.test.ts`
- Modify: `apps/api/src/application/test-fakes/builders.ts` (`withPaymentMethods(PaymentMethods)` becomes `withPaymentHandles(raw: { venmoHandle?: string; zelleHandle?: string })`), and its callers `apps/api/src/application/use-cases/GetContributions.test.ts`, `GetManageView.test.ts`, `PledgeContribution.test.ts`

**Interfaces:**
- Produces: `export const PAYMENT_METHODS = ['venmo', 'zelle'] as const; export type PaymentMethod`. `class PaymentHandle { readonly method: PaymentMethod; readonly handle: string; static from(method: PaymentMethod, raw: string): PaymentHandle }`. `from` trims and normalizes (strips Venmo's `@`, lower-cases a Zelle email, turns a Zelle phone into `+1` and 10 digits); the private constructor checks the normalized form and throws `DomainValidationError`, so a blank handle is refused. `PaymentMethods.venmoHandle`/`zelleHandle` stay `string | null`.

- [ ] **Step 1: Move the four format `it.each` blocks** from `PaymentMethods.test.ts` to `PaymentHandle.test.ts`, calling `PaymentHandle.from('venmo' | 'zelle', raw).handle`. Add `'  '` as a row in both refusal tables. Move "is idempotent on its own output" too, as `it.each` per method: "accepts its own output again" (`PaymentHandle.from(m, PaymentHandle.from(m, raw).handle)` equals it; protects the constructor accepting normalized form). `PaymentMethods.test.ts` keeps only "treats blank handles as absent".
- [ ] **Step 2: Run** `scripts/verify.sh --quick apps/api src/domain/value-objects` — FAIL (no `PaymentHandle`).
- [ ] **Step 3: Write `PaymentHandle`, point `PaymentMethods.from` at it, change the builder and its three callers.** The builder change is here so that Task 3, which changes how lists get their handles, stays within 10 files. No new builder tests.
- [ ] **Step 4: Verify** `scripts/verify.sh --e2e` on a clean tree.
- [ ] **Step 5: Commit** `refactor: a PaymentHandle value object checks each handle`

### Task 2: The list's handles move to `owner_pii` (PR 2)

**Files:**
- Create: `apps/api/src/infrastructure/db/migrations/0007_owner_pii.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/index.ts`, `apps/api/src/infrastructure/db/schema.ts`, `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Test: `apps/api/src/infrastructure/db/schema.integration.test.ts`

**Interfaces:**
- Produces tables: `owner_pii (id text pk, wishlist_id text not null → wishlists.id, method text not null CHECK in ('venmo','zelle'), handle text not null, redacted_at text, created_at text not null)`; `wishlists.venmo_owner_pii_ref`, `wishlists.zelle_owner_pii_ref` (nullable → `owner_pii.id`) in place of `venmo_handle`/`zelle_handle`; `contributions.owner_pii_ref` (nullable → `owner_pii.id`). Kysely `OwnerPiiTable` and the new columns in `schema.ts`.
- `WishlistRepositoryKysely.insert` writes the list row with null refs, then one `owner_pii` row per handle (id from `uuid`'s `v7`, as the migration does), then sets the refs. `hydrate` reads the referenced rows and builds `PaymentMethods.from`.

- [ ] **Step 1: Write the failing migration test** in `schema.integration.test.ts`, `describe('0007 owner_pii', …)`, following the 0006 test's pattern (migrate a fresh database to 0006, insert two lists with raw SQL, run `migrateToLatest`): "moves each list's Venmo and Zelle handles into owner_pii rows the list references, and gives a list with neither no rows". List W1 has `my-venmo` and `me@example.com`, W2 neither. Through each ref, W1's rows carry method `venmo` and `zelle` and those handles, W2 has no refs, and `owner_pii` holds two rows, both W1's. Add `{ name: '0007_owner_pii' }` to the expected list in "adopts a database the first release created…". Protects: the migration's copy.
- [ ] **Step 2: Run** `scripts/verify.sh --quick apps/api src/infrastructure/db/schema.integration.test.ts` — FAIL (no `0007_owner_pii`).
- [ ] **Step 3: Write `up(db)`**: create `owner_pii`; add the three ref columns; for each list with a handle, insert a row (`v7()`, method, the stored handle, `created_at` now) and set its ref; drop `venmo_handle` and `zelle_handle`. Doc comment: owner handles are owner PII, one row per record (ADR-0090).
- [ ] **Step 4: Change the repository and schema types.** The wishlist contract's existing "round-trips payment methods and item fields" covers the new reads and writes for both adapters; no new contract test.
- [ ] **Step 5: Verify** `scripts/verify.sh --e2e`; **commit** `feat: keep a list's payment handles in owner_pii`

### Task 3: The aggregate mints the handle rows' ids (PR 3)

**Files:**
- Modify: `apps/api/src/domain/value-objects/PaymentMethods.ts`, `PaymentMethods.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, `Wishlist.test.ts`
- Modify: `apps/api/src/application/use-cases/CreateList.ts`, `apps/api/src/application/test-fakes/builders.ts`, `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`, `contributionRepository.contract.ts`, `apps/api/src/application/use-cases/GetListView.test.ts` (callers of `Wishlist.create` with handles)

**Interfaces:**
- Produces: `interface ListHandle { readonly id: UuidId; readonly handle: PaymentHandle }`. `PaymentMethods { readonly venmo: ListHandle | null; readonly zelle: ListHandle | null; static mint(raw: { venmoHandle?: string | null; zelleHandle?: string | null }, ids: { generateEntityId(): string }): PaymentMethods; static reconstitute(rows: { venmo: { id: string; handle: string } | null; zelle: { id: string; handle: string } | null }): PaymentMethods }`; `from` goes; getters `venmoHandle`/`zelleHandle` and `isEmpty()` stay.
- `Wishlist.create` overloads: `create(props)` for a list without handles, `create(props & { venmoHandle?: string | null; zelleHandle?: string | null }, ids: { generateEntityId(): string })`. `CreateList` passes `this.tokenGenerator`. The repository writes and reads the domain's ids.

- [ ] **Step 1: Failing tests.** `Wishlist.test.ts`: "mints a row id for the Venmo handle a new list starts with" (`create({ ...validProps, venmoHandle: 'my-venmo' }, ids)` → `paymentMethods.venmo?.id.value` is the generated id; protects `create` calling `mint`; blank handles stay `PaymentMethods`' test). `PaymentMethods.test.ts`: "treats blank handles as absent" calls `mint`. Wishlist contract "round-trips payment methods and item fields" also asserts both rows' ids come back (protects the repository writing the domain's ids, not its own).
- [ ] **Step 2: Run** `scripts/verify.sh --quick apps/api src/domain` — FAIL.
- [ ] **Step 3: Implement**, move the callers, delete the repository's `v7` import.
- [ ] **Step 4: Verify** `scripts/verify.sh`; **commit** `refactor: the wishlist mints its payment handle rows' ids`

### Task 4: An `OwnerPiiRepository` for pledge rows (PR 4)

**Files:**
- Create: `apps/api/src/application/ports/OwnerPiiRepository.ts`, `apps/api/src/application/ports/contracts/ownerPiiRepository.contract.ts`, `apps/api/src/infrastructure/OwnerPiiRepositoryKysely.ts`
- Modify: `apps/api/src/application/ports/UnitOfWork.ts` (`TransactionContext.ownerPii`), `apps/api/src/infrastructure/UnitOfWorkKysely.ts`, `apps/api/src/application/test-fakes/InMemoryRepositories.ts` (`InMemoryOwnerPiiRepository`, a store map, wired into `inMemoryPersistence`)
- Modify: `apps/api/src/infrastructure/contracts.integration.test.ts`, `apps/api/src/application/test-fakes/InMemoryRepositories.contract.test.ts`
- Modify: `apps/api/src/application/use-cases/BuyItem.test.ts`, `HoldItem.test.ts` (they build a `TransactionContext` by hand)

**Interfaces:**
- Produces: `interface OwnerPiiRepository { insert(id: string, wishlistId: string, payment: PaymentHandle): Promise<void>; findByIds(ids: readonly string[]): Promise<Map<string, PaymentHandle>> }`. The Kysely adapter rebuilds with `PaymentHandle.from`. Its first caller is Task 6; the PR body names that PR.

- [ ] **Step 1: Contract suite** `describeOwnerPiiRepositoryContract(adapter, factory)`, run for both adapters:
  - "round-trips a pledge's method and handle by id" (protects insert + read mapping)
  - "leaves an unknown id out of what it reads"
  - "reads nothing for no ids" (protects the early return: SQLite refuses `in ()`)
  - "refuses a second insert with the same id"
- [ ] **Step 2: Run** `scripts/verify.sh --quick apps/api src/infrastructure/contracts.integration.test.ts` — FAIL.
- [ ] **Step 3: Implement the port, both adapters and the wiring.**
- [ ] **Step 4: Verify** `scripts/verify.sh`; **commit** `feat: an owner_pii repository for the handle a pledge names`

### Task 5: A contribution carries `ownerPiiRef` (PR 5)

**Files:**
- Modify: `apps/api/src/domain/entities/Contribution.ts`, `Item.ts`, `Item.test.ts`, `Wishlist.ts` (pledge props), `apps/api/src/domain/events/ContributionPledgedEvent.ts`
- Modify: `apps/api/src/infrastructure/ContributionRepositoryKysely.ts`, `apps/api/src/application/ports/contracts/contributionRepository.contract.ts` (fixture gains `seedOwnerPii(id: string, wishlistId: string)`), `apps/api/src/infrastructure/contracts.integration.test.ts`, `apps/api/src/application/test-fakes/InMemoryRepositories.contract.test.ts` (both wire `seedOwnerPii`)

**Interfaces:**
- Produces: `Contribution.ownerPiiRef: UuidId | null`; `create`/`reconstitute` take `ownerPiiRef?: string | null`, optional because pledges made before this, or sent without a method, have none. `Item.pledge` and `Wishlist.pledge` props gain `ownerPiiRef?: string`; the event sets `ownerPiiRef: props.ownerPiiRef` (JSON drops an undefined key). `ContributionPledgedEvent.ownerPiiRef?: string` (doc comment: optional, because older events and pledges sent without a method lack it).

- [ ] **Step 1: Failing tests.**
  - `Item.test.ts`: "puts the pledge's ownerPiiRef on its contribution and its event" (protects `Item.pledge`).
  - Contribution contract: "round-trips a contribution's ownerPiiRef" (seeds the row with `seedOwnerPii`; protects the column mapping).
- [ ] **Step 2: Run** `scripts/verify.sh --quick apps/api` — FAIL.
- [ ] **Step 3: Implement.** No caller passes a ref until Task 6.
- [ ] **Step 4: Verify** `scripts/verify.sh`; **commit** `feat: a pledge can reference the handle it was paid to`

### Task 6: The pledge request records the method and handle (PR 6)

**Files:**
- Modify: `packages/shared-types/src/pledge.ts`; Create: `packages/shared-types/src/pledge.test.ts`
- Modify: `apps/api/src/application/use-cases/PledgeContribution.ts`, `PledgeContribution.test.ts`
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.ts`, `rebuildProjections.integration.test.ts` (the first PR whose events carry `ownerPiiRef`)
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces: `paymentMethodSchema = z.enum(['venmo', 'zelle'])` in `pledge.ts`, the shared types' one list of methods (Task 7 reuses it; the domain keeps its own `PAYMENT_METHODS`). Rebuild writes `owner_pii_ref: event.ownerPiiRef`.
- Produces: `pledgeRequestSchema.payment: z.object({ method: paymentMethodSchema, handle: z.string().max(254) }).optional()` (comment: optional because a tab loaded before this deploy sends none; capped like the create request's handles). The use case, after the replay check, parses `PaymentHandle.from(method, handle)` before anything is written, mints `ownerPiiRef`, passes it to `wishlist.pledge`, and inserts the `owner_pii` row (with `wishlistId`) before saving the aggregate.

- [ ] **Step 1: Failing tests.**
  - `pledge.test.ts`: "accepts a payment handle of 254 characters and refuses 255"; "refuses a payment method other than venmo or zelle".
  - `PledgeContribution.test.ts`: "stores the reported handle in its own owner_pii row, referenced by the contribution and its event" (protects mint + insert + pass-through); "records no payment for a pledge sent without one" (protects the `if (input.payment)` branch); "refuses a malformed handle before recording anything" (no contribution, event or row; protects parse-before-write). The existing "replays the original … writing nothing more" sends a payment and also asserts one `owner_pii` row.
  - Rebuild: "re-folds ownerPiiRef from ContributionPledged" (protects the fold).
- [ ] **Step 2: Run** the two files with `--quick` — FAIL.
- [ ] **Step 3: Implement; regenerate the OpenAPI document and client types.**
- [ ] **Step 4: Verify** `scripts/verify.sh`; **commit** `feat: a pledge records the method and handle the guest paid`

### Task 7: The gift details show each pledge's method and handle (PR 7)

**Files:**
- Modify: `packages/shared-types/src/contributions.ts`, `apps/api/src/application/use-cases/GetContributions.ts`, `GetContributions.test.ts`
- Modify: `apps/api/src/domain/value-objects/PaymentMethods.ts`, `PaymentMethods.test.ts`
- Modify: `apps/web/src/features/manage/ContributionsCard.tsx`, `ContributionsCard.test.tsx`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces: each pledge gains `payment: { method: paymentMethodSchema; handle: string; current: boolean } | null`. `PaymentMethods.isCurrent(reported: PaymentHandle): boolean` — the list's handle for that method, compared ignoring case for Venmo, exactly for Zelle (already normalized). `GetContributions` reads the pledges' rows with `ctx.ownerPii.findByIds`.

- [ ] **Step 1: Failing tests.**
  - `PaymentMethods.test.ts`: "counts a Venmo handle as current whatever its capitals"; "counts a handle as not current once it differs"; "counts a handle as not current when the list has none for its method".
  - `GetContributions.test.ts`: "shows each pledge's method and handle, and whether it is the list's current one" (two pledges: current and not; protects the read + `isCurrent` call). The existing exact-payload test gains `payment: null` for its pledge without a method.
  - `ContributionsCard.test.tsx`: "reads 'Sam · $40.00 via Venmo to @my-venmo' for a pledge with a method" (Zelle shows the handle without `@`, as one `it.each` row); "adds '(not your current handle)' to a pledge whose handle isn't current"; "adds 'method not recorded' to a pledge without one". The existing pledge fixture gains `payment: null`.
- [ ] **Step 2: Run** each with `--quick` — FAIL.
- [ ] **Step 3: Implement; regenerate.**
- [ ] **Step 4: Verify** `scripts/verify.sh`; **commit** `feat: the gift details say where each pledge was paid`

### Task 8: The dialog sends what it showed; removed and funded gifts; privacy page (PR 8)

**Files:**
- Modify: `apps/web/src/features/contribute/ContributeDialog.tsx`, `ContributeDialog.test.tsx`, `contributeDraft.ts`
- Modify: `apps/web/src/features/holds/ItemView.tsx` (`onChipInOpened`), `apps/web/src/pages/ListPage.tsx`, `ListPage.test.tsx`
- Modify: `apps/web/src/pages/PrivacyPage.tsx`

**Interfaces:**
- Consumes: Task 6's `PledgeRequest.payment`.
- Produces: `ContributeDraft.payment?: { method: PayMethod; handle: string }` (absent in drafts saved before this). The dialog freezes `{ method, handle }` when the pay step opens (from the draft's when it has one), re-freezes when the guest switches method there, shows and links the frozen handle, sends it as `payment`, and saves it in the draft. `ItemView` calls `onChipInOpened()` when its chip-in opens. `ListPage` tracks the gift of the open chip-in or loaded draft; when a refetched list no longer has it, it shows the removed-gift alert (`role="alert"`) and clears the draft. A draft resumes for any group gift still on the list; a funded one shows the funded note in the dialog.

- [ ] **Step 1: Failing tests.**
  - `ContributeDialog.test.tsx`: "sends the Venmo handle it showed with the pledge"; "sends the Zelle handle once the guest switches to Zelle"; "sends the handle shown when the pay step opened, not the one the list changed to" (rerender with new `payment`; protects the freeze); "sends the handle a resumed draft saved, not the list's different one"; "notes that others finished funding the gift when a resumed draft's gift is fully funded" (the dialog decides the note).
  - `ListPage.test.tsx`: the "drops a draft for a gift that is %s" table becomes "tells the guest a gift they were paying for was removed, and drops its draft" (deleted) and "resumes a draft for a gift others fully funded, on the pay step" (funded). Add "tells the guest when the gift of an open chip-in is removed" (refetch without the gift while the dialog is open; protects the `onChipInOpened` path).
- [ ] **Step 2: Run** each with `--quick` — FAIL.
- [ ] **Step 3: Implement.** Privacy page: "What guests enter" says a pledge stores the method and handle the guest paid to; the cookie paragraph lists them among what a chip-in draft holds. No test (it states facts, not behaviour).
- [ ] **Step 4: Verify** `scripts/verify.sh --e2e`; **commit** `feat: the chip-in dialog records where the guest paid`
