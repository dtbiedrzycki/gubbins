# `pii_ref` → `guest_pii_ref` Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the guest-details reference from `pii_ref`/`piiRef` to `guest_pii_ref`/`guestPiiRef` everywhere except the ledger event payloads, so the owner-handle work can add `owner_pii_ref` beside it.

**Architecture:** One migration renames the column. The code rename follows AGENTS.md's steps for a breaking change, because the field reaches about 30 files: the entities take the new name and keep a temporary alias, callers move in batches, then the alias goes. Event types keep `piiRef`; `Item` (which builds events) and `rebuildProjections` (which reads them) map between the names.

**Tech Stack:** TypeScript, Kysely on SQLite (`node:sqlite`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-payment-handles-design.md`, section "Prerequisite: `pii_ref` → `guest_pii_ref`".

## Global Constraints

- Every PR touches at most 10 files, tests included (`git diff --stat <base>...HEAD | tail -1`).
- Every PR passes `scripts/verify.sh` on its own; the first PR into main also runs `--e2e`.
- Event payload key `piiRef` in `ItemHeldEvent` and `ContributionPledgedEvent` never changes; no new event version.
- Shipped migrations `0001`–`0005` are never edited (ADR-0085); the rename is `0006_guest_pii_ref`.
- No behaviour changes: the only new test is the migration's.
- No plan identifiers in commits, test names or comments.

## Review Focus

- **A database with rows migrates without losing them:** every hold's and contribution's reference survives under the new column name. Task 1 adds the test.
- **The foreign keys still hold after the rename:** a hold or contribution pointing at no `guest_pii` row is still refused. The existing contract tests ("refuses a hold whose piiRef has no guest_pii row" and its contribution twin) cover this; Task 1 runs them against the renamed column.
- **Old ledger events still rebuild:** `rebuildProjections` reads `event.piiRef` from events written before and after the rename. The existing "re-folds piiRef from ItemHeld" test covers it once its column assertion is renamed (Task 1).
- **Events built after the rename still carry `piiRef`:** the `HoldItem` and `PledgeContribution` tests that assert `toMatchObject({ piiRef: … })` on the recorded event stay unchanged in every task.
- **No alias outlives the stack:** Task 5 removes it, and its verification greps for `piiRef` outside the event types and their two mapping sites.

---

### Task 1: Rename the column (PR 1, targets main)

**Files:**
- Create: `apps/api/src/infrastructure/db/migrations/0006_guest_pii_ref.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/index.ts` (register `0006_guest_pii_ref`)
- Modify: `apps/api/src/infrastructure/db/schema.ts:51,79` (`pii_ref` → `guest_pii_ref`)
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts:16,43`, `apps/api/src/infrastructure/ContributionRepositoryKysely.ts:9,19` (column name only; entity field stays `piiRef` for now)
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.ts:55,74` (column `guest_pii_ref: event.piiRef`, with a one-line comment that the ledger keeps its old key)
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts:142,148` (the fake's mirrored FK message and comment say `guest_pii_ref`)
- Test: `apps/api/src/infrastructure/db/schema.integration.test.ts`, `apps/api/src/infrastructure/projections/rebuildProjections.integration.test.ts:46,157`

**Interfaces:**
- Produces: columns `holds.guest_pii_ref` (nullable, FK `guest_pii.id`) and `contributions.guest_pii_ref` (not null, FK `guest_pii.id`); Kysely types `HoldsTable.guest_pii_ref`, `ContributionsTable.guest_pii_ref`.

- [ ] **Step 1: Write the failing migration test** in `schema.integration.test.ts`, in a `describe('0006 guest_pii_ref', …)`:

```ts
it("keeps each hold's and contribution's guest reference under guest_pii_ref", async () => {
  // Migrate a fresh database to 0005 only, insert a guest_pii row, a hold and a contribution with pii_ref set,
  // then run 0006 and read back:
  expect(await db.selectFrom('holds').select('guest_pii_ref').execute()).toEqual([{ guest_pii_ref: PII }]);
  expect(await db.selectFrom('contributions').select('guest_pii_ref').execute()).toEqual([{ guest_pii_ref: PII }]);
});
```

Also add `{ name: '0006_guest_pii_ref' }` to the expected list in "adopts a database the first release created…".

- [ ] **Step 2: Run it and see it fail**

Run: `scripts/verify.sh --quick apps/api src/infrastructure/db/schema.integration.test.ts`
Expected: FAIL (no migration `0006_guest_pii_ref`).

- [ ] **Step 3: Write `up(db)` in `0006_guest_pii_ref.ts`**: `alter table holds rename column pii_ref to guest_pii_ref` and the same on `contributions`. SQLite (3.25+) rewrites the foreign keys that reference the column. Add a doc comment: the column names the guest's details, so it can sit beside the owner's.

- [ ] **Step 4: Rename the column everywhere Task 1's file list names it**, then run the API suite

Run: `scripts/verify.sh --quick apps/api`
Expected: PASS, including both contract suites' "refuses … has no guest_pii row" tests and "re-folds piiRef from ItemHeld".

- [ ] **Step 5: Verify and commit**

Run: `scripts/verify.sh --e2e` on a clean tree. Expected: `verify: all … checks passed for <sha>`.

```bash
git commit -m "refactor: rename the guest details column to guest_pii_ref"
```

### Task 2: Entities take `guestPiiRef`, with a temporary alias (PR 2, builds on PR 1)

**Files:**
- Modify: `apps/api/src/domain/entities/Hold.ts:42,66,76,89,94`
- Modify: `apps/api/src/domain/entities/Contribution.ts:15,23,27,32`
- Test: `apps/api/src/domain/entities/Hold.test.ts`, `apps/api/src/domain/entities/Contribution.test.ts`

**Interfaces:**
- Produces: `Hold.guestPiiRef: UuidId | null`, `Contribution.guestPiiRef: UuidId` (readonly fields). `Hold.create`/`reconstitute` and `Contribution.create`/`reconstitute` props take `guestPiiRef`, and also still accept `piiRef` until Task 5. A `/** @deprecated use guestPiiRef */ get piiRef()` on each returns the same value.

- [ ] **Step 1: Rename the field and props in both entities**, keeping the alias getter and reading `props.guestPiiRef ?? props.piiRef`. `Hold.create` still refuses a missing reference: the existing test passes `guestPiiRef: undefined` (and no `piiRef`).
- [ ] **Step 2: Move both entity test files to `guestPiiRef`.** No new tests: the alias has no behaviour of its own.
- [ ] **Step 3: Verify**: `scripts/verify.sh` on a clean tree passes.
- [ ] **Step 4: Commit**: `refactor: entities name their guest details reference guestPiiRef`

### Task 3: Domain commands and their callers take `guestPiiRef` (PR 3, builds on PR 2)

**Files:**
- Modify: `apps/api/src/domain/entities/Item.ts:215,229,243,258,281,298,309`: command props `guestPiiRef`; the events it builds still set `piiRef: …guestPiiRef…`, with a one-line comment that the ledger keeps its key.
- Modify: `apps/api/src/domain/entities/Wishlist.ts:313,322,331` (command props)
- Modify: `apps/api/src/application/use-cases/HoldItem.ts`, `BuyItem.ts`, `PledgeContribution.ts` (local `guestPiiRef`, props key, comments)
- Test: `apps/api/src/domain/entities/Item.test.ts`, `apps/api/src/domain/entities/Wishlist.test.ts`, `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts:191-195,328-347`, `apps/api/src/application/test-fakes/InMemoryRepositories.test.ts:9,58`

**Interfaces:**
- Consumes: Task 2's entity props.
- Produces: `Item.hold`/`Item.pledge`/`Wishlist.holdItem`/`Wishlist.buy…`/`Wishlist.pledge` props `{ …; guestPiiRef: string }`.

- [ ] **Step 1: Rename the props and every caller listed.** `Item.test.ts`'s "event carries piiRef" assertion (`expect(event.piiRef).toBe(PII)`) stays as it is.
- [ ] **Step 2: Verify**: `scripts/verify.sh` passes; `git diff --stat` shows at most 10 files.
- [ ] **Step 3: Commit**: `refactor: domain commands take guestPiiRef`

### Task 4: Readers move off the alias (PR 4, builds on PR 3)

**Files:**
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts`, `apps/api/src/infrastructure/ContributionRepositoryKysely.ts` (map `guestPiiRef` ↔ `guest_pii_ref`)
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts:48,148`, `apps/api/src/application/test-fakes/builders.ts:89`
- Modify: `apps/api/src/application/use-cases/GetContributions.ts:34-58`, `MarkHoldPurchased.ts:22-25`
- Test: `apps/api/src/application/ports/contracts/holdRepository.contract.ts:33-41` (test names say `guestPiiRef`), `apps/api/src/application/ports/contracts/contributionRepository.contract.ts:30,59`

Ten files. The remaining test readers (`BuyItem.test.ts:39,47`, `HoldItem.test.ts:45`, `PledgeContribution.test.ts:35`, `GetContributions.test.ts:95`, `MarkHoldPurchased.test.ts:78`, `presentation/inputLimits.test.ts:30`) move in Task 5.

- [ ] **Step 1: Rename the reads and fixture keys in the listed files.**
- [ ] **Step 2: Verify**: `scripts/verify.sh` passes.
- [ ] **Step 3: Commit**: `refactor: repositories and use cases read guestPiiRef`

### Task 5: Remaining tests move, and the alias goes (PR 5, builds on PR 4)

**Files:**
- Modify: `apps/api/src/domain/entities/Hold.ts`, `apps/api/src/domain/entities/Contribution.ts` (delete the `piiRef` getter and the `piiRef` prop)
- Modify: comments naming `piiRef` for the guest reference: `apps/api/src/domain/value-objects/GuestDetails.ts:5`, `apps/api/src/application/ports/GuestPiiRepository.ts:5`
- Test: `BuyItem.test.ts`, `HoldItem.test.ts`, `PledgeContribution.test.ts`, `GetContributions.test.ts`, `MarkHoldPurchased.test.ts` (under `apps/api/src/application/use-cases/`), `apps/api/src/presentation/inputLimits.test.ts`

Ten files. The `toMatchObject({ piiRef: … })` assertions on recorded events stay.

- [ ] **Step 1: Move the listed tests to `guestPiiRef`** (`BuyItem.test.ts`'s name becomes "…linked by guestPiiRef").
- [ ] **Step 2: Delete the alias and the old prop.** Then run:

Run: `git grep -n "piiRef\|pii_ref" -- apps/api/src ':!*migrations/000[1-5]*'`
Expected: hits only in `domain/events/ItemHeldEvent.ts`, `domain/events/ContributionPledgedEvent.ts`, the event-building lines in `Item.ts`, `rebuildProjections.ts`, the recorded-event assertions in `HoldItem.test.ts`, `PledgeContribution.test.ts` and `Item.test.ts`, and `rebuildProjections.integration.test.ts`'s event payload.

- [ ] **Step 3: Verify**: `scripts/verify.sh` passes.
- [ ] **Step 4: Commit**: `refactor: drop the piiRef alias`

### Task 6: Docs name `guest_pii_ref` (PR 6, builds on PR 5)

**Files:**
- Modify: `AGENTS.md` ("The exception is `piiRef`…" → `guestPiiRef`)
- Modify: `docs/spec/access-identity.md`, `backup-restore-and-upgrade.md`, `data-and-persistence.md`, `domain-model.md`, `governance-licensing-and-release.md`, `owner-dashboard.md`, `privacy.md`, `testing.md` (under `docs/spec/`)

ADRs that name `piiRef` (`0007`, `0008`, `0051`, `0057`, `0059`, `0060`, `0075`) describe event payloads, which keep `piiRef`. Change only lines in them that name the column or entity field, and do that inside this PR's 10 files or as a second docs PR. Past plans and specs under `docs/superpowers/` stay as written.

Outside the repo: the `reviewing-for-recurring-feedback` skill (in `~/.claude/skills/`) names `piiRef` as the use-case-minted exception. Update it in the same session; it's not part of the PR.

- [ ] **Step 1: Rename in the listed files**, where they mean the column or the entity field, not an event payload.
- [ ] **Step 2: Verify**: `python3 scripts/check_adr_links.py` prints "All links resolve."
- [ ] **Step 3: Commit**: `docs: name the guest details reference guest_pii_ref`
