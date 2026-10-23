# Wishlist → Item → Hold / Contribution Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Hold` and `Contribution` entities nested under `Item` inside the `Wishlist` aggregate. Use cases then persist through one `wishlists.save(wishlist)` and touch no hold or contribution ports.

**Architecture:**
- **Loading:** the repository loads every hold and contribution on the list, the same way it loads items, and nests them under their item.
- **Domain:** `Item` decides from its own holds and contributions. `Wishlist` authorizes and delegates, and it gains the idempotency-replay rules.
- **Ports:** `HoldRepository` and `ContributionRepository` shrink to collaborators used only by the adapters, and they leave `TransactionContext`.

**Tech Stack:** TypeScript, Node, Fastify, Kysely on SQLite, Vitest; npm workspaces (`apps/api`, `apps/web`, `packages/shared-types`).

**Spec:** `docs/superpowers/specs/2026-10-15-wishlist-item-hold-boundary-design.md`

**As built:** this plan was executed as written in #74–#82. Review then changed the following, so where a task below disagrees, the code and the spec follow these:
- `Item` decides extend, release and purchase, including `purchaseRefusal`, and `recordEvent` is private. `Wishlist`'s hold commands and `can…` predicates resolve the item and delegate (#84).
- `Wishlist.owns` is removed (#80).
- A pledge of zero is refused only by the `Contribution` constructor; `Item.pledge` keeps the checks that need the item (eeb5acd).
- #83 drops an unused holds index from the initial migration, which is edited in place until release.
- `ItemRepository` returns plain `ItemRow`s, and `hydrate` assembles each item with its holds and contributions (#85).
- The replay lookups are `findHoldForReplay` / `findContributionForReplay`, and the item's key lookups are `findHoldWithKey` / `findContributionWithKey` (#86). This plan uses those names throughout.

## Global Constraints

- **Ten files per PR:** every PR (= branch) changes **at most 10 files**. Check with `git diff --stat <base>...HEAD | tail -1` before pushing.
- **Branches:** each branch stacks on the previous one: `feat/launch/34b-boundary-spec` → `35-adr-0078-boundary` → `36-load-all-holds` → `37-holds-under-item` → `37a-money-total-cap` → `37b-replay-in-domain` → `38-commands-via-aggregate` → `39-list-view-from-aggregate` → `40a-tests-read-rows` → `40b-drop-hold-ports`.
- **Fixes to a lower branch** reach the branches above it by `git merge`. Never rebase or force-push.
- **No behaviour change:** route tests (`apps/api/src/presentation/*.test.ts`) and e2e are not edited and must stay green. The one deliberate exception is Task 3a: a pledge that would take an item's pledged total past `MAX_MONEY_MINOR` (10¹² minor units) is refused (ADR-0061, amended in Task 1).
- **No new migration or table change.**
- **Events:** commands keep returning their ledger events. Don't add pending-event lists to entities.
- **Use cases keep:** minting `piiRef`, and calling `ctx.guestPii.insert` before `ctx.wishlists.save`.
- **Test names and comments** state behaviour in plain words. They contain no plan identifiers (no task numbers, branch names or "§"). ADR citations are fine.
- **Domain methods** follow ADR-0079: commands are verbs, queries are nouns, predicates are questions.
- **No time argument** on any `Wishlist` command or query. `Item` gets `asOf` when it is built or loaded.
- **Checks, run before every commit, from the repo root:**
  - `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api`. tsc is the only check that typechecks the tests.
  - `npm test -w @gubbins/api`.
- **Commit trailer:** every commit message ends with
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018q4vDnmfeUGn5kQc8Wtr96
  ```
- **Before Task 1:** `feat/launch/34b-boundary-spec` must first merge `origin/feat/launch/34-wishlist-save-holds`, which has been merged up after #66–#72 landed.

## Review Focus

1. **Replay after the original hold expired:** a replayed `HoldItem` key whose hold has since expired returns that hold's view. It must not give `ItemUnavailableError`. Pinned in Task 4 (`findHoldForReplay` returns an expired hold).
2. **Purchase of an expired hold:** an expired hold purchased after it lapsed must be persisted, with the count right on the next load, now that `keep()` is gone. Pinned in Task 3 (contract case rewritten to use the aggregate's own instance).
3. **Contribution replay:** a pledge replayed with the same key must not insert a second row. `save` inserts only contributions not yet stored. Pinned in Task 5 (contract: a second `save` inserts nothing).
4. **Commands on another list's hold:** extend, release or purchase on another list's hold still give `HoldNotFoundError` after `findOwnedHold` is deleted. Pinned by the existing `onOtherList` use-case tests, which Task 5 must not edit, plus Task 3's `findHold` test.
5. **Reconstitute rejects outsiders:** a loaded hold or contribution whose `itemId` is another item's is rejected when the item is built. This moves from `Wishlist` to `Item` in Task 3.

Task 3a's own risk, a $0 pledge slipping through once `Money` allows 0, is pinned where it is refused: the `Contribution` constructor, which every pledge and every stored row goes through.

---

### Task 0: Bring the spec branch up to date

**Files:** none changed by hand.

- [ ] **Step 1: Merge branch 34**

```bash
git switch feat/launch/34b-boundary-spec
git fetch origin
git merge --no-edit origin/feat/launch/34-wishlist-save-holds
```
Expected: a clean merge, since 34b only adds the spec and this plan.

- [ ] **Step 2: Check it builds and passes**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS.

---

### Task 1: Amend ADR-0078 in place (branch `35-adr-0078-boundary`)

**Files:**
- Modify: `docs/adr/0078-wishlist-is-the-aggregate-root.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/adr/0061-currency-validation-minor-unit-storage-and-the-ceiling.md`

**Interfaces:** none.

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/35-adr-0078-boundary
```

- [ ] **Step 2: Edit the ADR's title and header**

Change the H1 to `# 0078. Wishlist is the aggregate root for its items, holds and contributions` and add this line under `- **Date:** 2026-09-13`:
```markdown
- **Amended:** 2026-10-15. Holds and contributions moved inside the aggregate, and the whole list is now loaded.
```

- [ ] **Step 3: Replace the two Decision bullets about holds**

Replace the bullet starting "`Hold` is its own aggregate" and the bullet starting "The aggregate carries a snapshot" with:
```markdown
- The boundary is `Wishlist → Item → Hold / Contribution`. `Hold` and
  `Contribution` are entities nested under their `Item`, not aggregates
  of their own. The wishlist authorizes (`getItem`, `owns`) and owns
  rules that span items; an item decides on its own holds and
  contributions (availability, purchased count, placing a hold,
  pledging); a hold or contribution records its own lifecycle. A
  purchase is a terminal state of a `Hold`.
- Repositories load and save the whole aggregate: the list, every item,
  and every hold and contribution on it. There are no use-case-facing
  hold or contribution repositories. A command's only other port calls
  are the event append and records outside the aggregate.
```

- [ ] **Step 4: Add a rejected alternative**

Append to "Alternatives considered":
```markdown
- **`Hold` (and `Contribution`) as aggregates of their own** — the
  original form of this ADR, rejected on 2026-10-15: the wishlist
  created and changed holds anyway, so each use case cascaded the
  writes by hand (event, hold, item state) and repeated that cascade.
  The quantity rule spans an item and all its holds, so they belong
  inside one boundary.
```

- [ ] **Step 5: Replace the bounded-load consequence**

Replace the bullet starting "Loading the aggregate loads its active holds" with:
```markdown
- Loading the aggregate loads every hold and contribution on the list,
  as it loads every item. Expired holds are never closed (lazy expiry),
  so the load grows with a list's history; at the scale the
  performance & resource budget assumes this is small. Revisit if a
  list's history grows large.
```
Replace the bullet "A list with very many active holds makes each command's load larger. …" with:
```markdown
- A list with a long hold history makes each command's load larger.
  That is acceptable at the scale the
  [performance & resource budget](../spec/performance-and-resource-budget.md)
  assumes; revisit if measurement says otherwise.
```

- [ ] **Step 6: Add the pre-release note to the README**

In `docs/adr/README.md`, after the bullet "An accepted ADR is immutable. …", add:
```markdown
- Until the first release, an accepted ADR may be amended in place
  instead: add an `Amended:` line with the date and what changed.
  After the first release, supersede it as above.
```

- [ ] **Step 7: Amend ADR-0061: the guard bounds an item's total**

Add this line under `- **Date:** 2026-09-09`:
```markdown
- **Amended:** 2026-10-15. The arithmetic guard also bounds each item's pledged total, and zero is a valid amount.
```
Append to "Consequences":
```markdown
- The arithmetic guard (`MAX_MONEY_MINOR`, 10¹² minor units) bounds an
  item's pledged total as well as each pledge: a pledge that would take
  the total past it is refused like an oversized pledge. Sums of stored
  amounts then stay in safe-integer range, which is what the guard is
  for. An amount may be zero (an item with no pledges totals zero); a
  pledge itself must still be more than zero.
```

- [ ] **Step 8: Commit**

```bash
git add docs/adr/0078-wishlist-is-the-aggregate-root.md docs/adr/README.md docs/adr/0061-currency-validation-minor-unit-storage-and-the-ceiling.md
git commit -m "docs(adr): holds and contributions sit inside the wishlist; the money guard bounds totals"
```

---

### Task 2: Load every hold on the list (branch `36-load-all-holds`)

The domain is still flat (`Wishlist._holds`) here, and it already re-checks every hold with `statusAt`, so loading expired and released holds changes no behaviour. `ContributionRepository.findForWishlist` gets its first caller in Task 3. Say so in the PR body, since adding that caller here would push Task 3 over the file cap.

**Files:**
- Modify: `apps/api/src/application/ports/HoldRepository.ts`
- Modify: `apps/api/src/application/ports/ContributionRepository.ts`
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/ContributionRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Test: `apps/api/src/application/ports/contracts/holdRepository.contract.ts`
- Test: `apps/api/src/application/ports/contracts/contributionRepository.contract.ts`
- Test: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`

**Interfaces:**
- Produces: `HoldRepository.findForWishlist(wishlistId: string): Promise<Hold[]>`. Every hold on the list's items, whatever its state, ordered by `expiresAt`.
- Produces: `ContributionRepository.findForWishlist(wishlistId: string): Promise<Contribution[]>`. Every contribution on the list's items, ordered by `pledgedAt`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/36-load-all-holds
```

- [ ] **Step 2: Write the failing contract cases**

In `holdRepository.contract.ts`, add next to the `findActiveOrPurchasedForWishlist` cases:
```ts
it("findForWishlist returns every hold on the list's items, whatever its state, and none from another list", async () => {
  const mine = [holdFixture(), holdFixture({ expiresAt: later(-1) }), holdFixture({ releasedAt: later(-5) }), holdFixture({ purchasedAt: later(-5) })];
  for (const hold of mine) await fx.holds.insert(hold);
  await fx.holds.insert(holdFixture({ itemId: ITEM_B }));

  const found = await fx.holds.findForWishlist(LIST_A);

  expect(found.map((h) => h.id.value).sort()).toEqual(mine.map((h) => h.id.value).sort());
});
```
In `contributionRepository.contract.ts` (its seed puts `MIXER` and `STROLLER` on `LIST_X`, and `OTHER_LIST_ITEM` on `LIST_Y`; `pledge()` mints ascending ids, all pledged at `NOW`), add:
```ts
it("findForWishlist returns every contribution on the list's items, oldest pledge first, and none from another list", async () => {
  const first = pledge(MIXER, 2500);
  const second = pledge(STROLLER, 1500);
  for (const c of [first, second, pledge(OTHER_LIST_ITEM, 1000)]) await fx.contributions.insert(c);

  const found = await fx.contributions.findForWishlist(LIST_X);

  expect(found.map((c) => c.id.value)).toEqual([first.id.value, second.id.value]);
});
```

In `wishlistRepository.contract.ts`, replace the case `"loads the list's holds active or purchased at now, and no others"` with:
```ts
it("loads every hold on the list, whatever its state, and none from another list", async () => {
  const mine = [holdFixture(), holdFixture({ purchasedAt: later(-5), expiresAt: later(-1) }), holdFixture({ expiresAt: later(-1) }), holdFixture({ releasedAt: later(-5) })];
  const elsewhere = holdFixture({ itemId: ITEM_B });
  for (const hold of [...mine, elsewhere]) await fx.holds.insert(hold);

  const loaded = await fx.wishlists.findById(LIST_A, NOW);

  for (const hold of mine) expect(loaded?.findHold(hold.id.value)?.id.value).toBe(hold.id.value);
  expect(loaded?.findHold(elsewhere.id.value)).toBeNull();
});
```

- [ ] **Step 3: Run the contracts to see them fail**

Run: `npm test -w @gubbins/api -- contracts`
Expected: FAIL. `findForWishlist` doesn't exist yet (a type error at build), and the wishlist case finds no expired or released hold.

- [ ] **Step 4: Add `findForWishlist` to the ports**

`HoldRepository.ts`, add:
```ts
/** Every hold on the list's items, whatever its state, oldest expiry first: what the `Wishlist` aggregate loads. */
findForWishlist(wishlistId: string): Promise<Hold[]>;
```
`ContributionRepository.ts`, add:
```ts
/** Every contribution on the list's items, oldest pledge first: what the `Wishlist` aggregate loads. */
findForWishlist(wishlistId: string): Promise<Contribution[]>;
```

- [ ] **Step 5: Implement it in the Kysely adapters**

`HoldRepositoryKysely.ts`:
```ts
async findForWishlist(wishlistId: string): Promise<Hold[]> {
  const rows = await this.db.selectFrom('holds')
    .innerJoin('items', 'items.id', 'holds.item_id')
    .selectAll('holds')
    .where('items.wishlist_id', '=', wishlistId)
    .orderBy('holds.expires_at').orderBy('holds.id')
    .execute();
  return rows.map(toHold);
}
```
`ContributionRepositoryKysely.ts`: extract the row mapping in `findByIdempotencyKey` into a module-level `toContribution(row)` and reuse it:
```ts
async findForWishlist(wishlistId: string): Promise<Contribution[]> {
  const rows = await this.db.selectFrom('contributions')
    .innerJoin('items', 'items.id', 'contributions.item_id')
    .selectAll('contributions')
    .where('items.wishlist_id', '=', wishlistId)
    .orderBy('contributions.pledged_at').orderBy('contributions.id')
    .execute();
  return rows.map(toContribution);
}
```

- [ ] **Step 6: Make the aggregate load every hold**

In `WishlistRepositoryKysely.hydrate`, replace `findActiveOrPurchasedForWishlist(row.id, now)` with `findForWishlist(row.id)`. Rewrite the doc comment above `hydrate`:
```ts
/**
 * Every hold on the list, like its items (ADR-0078). `now` is the
 * aggregate's `asOf`, the one instant it decides at.
 */
```
Above the hold loop in `save`, add:
```ts
// shortcut: writes every loaded hold, changed or not; compare lifecycle columns first if a list's hold history grows large.
```

- [ ] **Step 7: Mirror it in the fakes**

In `InMemoryRepositories.ts`:
- **`InMemoryWishlistRepository.hydrate`:** use `this.store.holdsOnList(wishlist.id.value).map(copyHold)`.
- **`InMemoryHoldRepository`:** add
  ```ts
  async findForWishlist(wishlistId: string): Promise<Hold[]> {
    return this.store.holdsOnList(wishlistId)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.value.localeCompare(b.id.value))
      .map(copyHold);
  }
  ```
- **`InMemoryContributionRepository`:** add
  ```ts
  async findForWishlist(wishlistId: string): Promise<Contribution[]> {
    return [...this.store.contributions.values()]
      .filter((c) => this.store.items.get(c.itemId.value)?.wishlistId.value === wishlistId)
      .sort((a, b) => a.pledgedAt.getTime() - b.pledgedAt.getTime() || a.id.value.localeCompare(b.id.value));
  }
  ```

- [ ] **Step 8: Run all API tests**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/application/ports apps/api/src/infrastructure/HoldRepositoryKysely.ts apps/api/src/infrastructure/ContributionRepositoryKysely.ts apps/api/src/infrastructure/WishlistRepositoryKysely.ts apps/api/src/application/test-fakes/InMemoryRepositories.ts
git commit -m "feat(api): load every hold on the list with the wishlist"
```

---

### Task 3: Nest holds and contributions under Item (branch `37-holds-under-item`)

**Files:**
- Modify: `apps/api/src/domain/entities/Item.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Modify: `apps/api/src/application/ports/ItemRepository.ts`
- Modify: `apps/api/src/infrastructure/ItemRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Modify: `apps/api/src/application/test-fakes/builders.ts`
- Test: `apps/api/src/domain/entities/Item.test.ts`
- Test: `apps/api/src/domain/entities/Wishlist.test.ts`
- Test: `apps/api/src/application/views/HoldView.test.ts`

That is 10 files. If any other file breaks the build, stop and report it instead of going over the cap.

A hold command accepts any `Hold` with the id of a hold the aggregate loaded, and acts on the aggregate's own instance of it. Until Tasks 5–6 land, use cases and contract tests still pass copies read through `ctx.holds`. So matching by id, not by instance, keeps them working in the meantime, and it means `save` always sees the change.

**Interfaces:**
- Consumes: `HoldRepository.findForWishlist`, `ContributionRepository.findForWishlist` (Task 2).
- Produces, on `Item`:
  - `Item.createSingle(props & { asOf: Date })`, `Item.createGroup(props & { asOf: Date })`
  - `Item.reconstitute(props & { asOf: Date; holds?: readonly Hold[]; contributions?: readonly Contribution[] })`. Throws `DomainValidationError` for a hold or contribution on another item.
  - `item.holds: readonly Hold[]`, `item.contributions: readonly Contribution[]`
  - `item.isLoadedAt(at: Date): boolean`
  - `item.findHold(holdId: string): Hold | null`
  - `item.purchasedCount(): number`, `item.availableUnits(): number`, `item.status(): ItemStatus`
  - `item.placeHold(props: { sessionHash; idempotencyKey; durationMs; piiRef }, tokens, hasher)`. It no longer takes `at` or counts, and it adds the hold to `item.holds`.
  - `item.pledge(props: { amountMinor; sessionHash; idempotencyKey; piiRef }, ids)`. It no longer takes `at`, and it adds the contribution to `item.contributions`.
- Produces, on `Wishlist`:
  - `Wishlist.reconstitute({ …, asOf, items })`. There is no `holds` prop any more. It throws `DomainValidationError` for an item loaded at a different instant.
  - `wishlist.holds` and `wishlist.contributions` are flattened from the items.
- Produces, in the adapters: `ItemRepository.findAllByWishlistId(wishlistId: string, members: { asOf: Date; holds: readonly Hold[]; contributions: readonly Contribution[] }): Promise<Item[]>` and `ItemRepository.seqsByWishlistId(wishlistId: string): Promise<Map<string, number>>`.
- **Removed:** `Item.statusGiven`, the count arguments of `Item.availableUnits`, `Wishlist`'s private `_holds`, `keep` and `activeHoldsOn`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/37-holds-under-item
```

- [ ] **Step 2: Write the failing Item tests**

In `Item.test.ts`:
- Add `asOf: T0` to every `Item.createSingle`, `Item.createGroup` and `Item.reconstitute` call, and to `base`.
- Add `const T0 = new Date('2026-01-01T00:00:00.000Z');` and a `holdOn(overrides)` helper copied from `Wishlist.test.ts`, with `itemId: ITEM_ID` by default.
- Move every availability, status and `placeHold` count test from `Wishlist.test.ts` (`availableUnitsOf`, `holdItem` refusals, `itemStatus — lazy expiry`, the purchased-count cases under `Wishlist.reconstitute`) into a `describe('Item holds')` here. Rewrite them against `Item.reconstitute({ ...base, quantity, holds: [...] })`.

The new or moved cases must include at least:
```ts
describe('Item holds', () => {
  it('is available while the quantity exceeds active and purchased holds', () => {
    const item = Item.reconstitute({ ...base, quantity: 2, holds: [holdOn()] });
    expect(item.availableUnits()).toBe(1);
    expect(item.status()).toBe('available');
  });

  it('is held up to and including the instant its last hold expires, available 1 ms later', () => {
    const hold = holdOn({ expiresAt: T0 });
    expect(Item.reconstitute({ ...base, asOf: T0, holds: [hold] }).status()).toBe('held');
    expect(Item.reconstitute({ ...base, asOf: new Date(T0.getTime() + 1), holds: [hold] }).status()).toBe('available');
  });

  it('counts purchased holds, and is purchased once they cover the quantity', () => {
    const item = Item.reconstitute({ ...base, holds: [holdOn({ purchasedAt: T0 })] });
    expect(item.purchasedCount()).toBe(1);
    expect(item.status()).toBe('purchased');
  });

  it('counts neither a released nor an expired hold', () => {
    const item = Item.reconstitute({ ...base, holds: [holdOn({ releasedAt: T0 }), holdOn({ expiresAt: new Date(T0.getTime() - 1) })] });
    expect(item.availableUnits()).toBe(1);
  });

  it('places a hold on a free unit and adds it to its own holds', () => {
    const item = Item.reconstitute({ ...base });
    const { hold, expectedSeq } = item.placeHold({ sessionHash: 'a'.repeat(64), idempotencyKey: 'tap-1', durationMs: DAY }, tokens, hasher);
    expect(item.holds).toEqual([hold]);
    expect(hold.expiresAt).toEqual(new Date(T0.getTime() + DAY));
    expect(expectedSeq).toBe(0);
  });

  it('refuses a hold once its own active hold covers the last unit', () => {
    const item = Item.reconstitute({ ...base, holds: [holdOn()] });
    expect(() => item.placeHold({ sessionHash: 'a'.repeat(64), idempotencyKey: 'tap-2', durationMs: DAY }, tokens, hasher)).toThrow(ItemUnavailableError);
  });

  it('rejects a loaded hold or contribution that is on another item', () => {
    const other = '44444444-4444-7444-8444-444444444444';
    expect(() => Item.reconstitute({ ...base, holds: [holdOn({ itemId: other })] })).toThrow(DomainValidationError);
  });

  it('pledges toward a group gift and adds the pledge to its own contributions', () => {
    const item = Item.reconstitute({ ...base, type: 'group', priceMinor: 10_000 });
    const { contribution } = item.pledge({ amountMinor: 2_500, sessionHash: 'a'.repeat(64), idempotencyKey: 'p-1', piiRef: '66666666-6666-7666-8666-666666666666' }, ids);
    expect(item.contributions).toEqual([contribution]);
    expect(contribution.pledgedAt).toEqual(T0);
  });
});
```
Define `tokens`, `hasher` and `ids` at the top of the file the way `Wishlist.test.ts` does: `tokens = { generateEntityId: () => '55555555-5555-7555-8555-555555555555', generateHoldSecret: () => 'hold-secret' }`, `hasher = { hash: () => 'f'.repeat(64) }`, and `ids = { generateEntityId: () => '77777777-7777-7777-8777-777777777777' }`. Existing `pledge` tests drop their `at` prop.

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -w @gubbins/api -- Item.test`
Expected: FAIL (no `holds`, `status()` or `asOf` on `Item`).

- [ ] **Step 4: Give Item its holds and contributions**

In `Item.ts`:
- **Constructor:** add `private readonly asOf: Date`, `private _holds: Hold[]` and `private _contributions: Contribution[]` as the last parameters. Add these checks:
  ```ts
  if ([..._holds, ..._contributions].some((member) => member.itemId.value !== id.value)) {
    throw new DomainValidationError('A hold or contribution belongs to another item');
  }
  ```
- **Factories:** both take `asOf: Date` and pass `new Date(props.asOf.getTime()), [], []`.
- **`reconstitute`:** takes `asOf: Date; holds?: readonly Hold[]; contributions?: readonly Contribution[]` and passes `new Date(props.asOf.getTime()), [...(props.holds ?? [])], [...(props.contributions ?? [])]`.
- **Replace `availableUnits(active, purchased)` and `statusGiven(...)` with:**
  ```ts
  get holds(): readonly Hold[] { return this._holds; }
  get contributions(): readonly Contribution[] { return this._contributions; }

  /** Whether this item decides at `at`: its aggregate's instant, set when it was built or loaded. */
  isLoadedAt(at: Date): boolean { return this.asOf.getTime() === at.getTime(); }

  findHold(holdId: string): Hold | null {
    return this._holds.find((hold) => hold.id.value === holdId) ?? null;
  }

  /** Units bought: its holds marked purchased. Derived, never stored. */
  purchasedCount(): number { return this.holdsThatAre('purchased'); }

  /** Units no one holds or has bought. Never negative: quantity may drop below what is already committed (ADR-0019). */
  availableUnits(): number {
    return Math.max(0, this.quantity - this.holdsThatAre('active') - this.purchasedCount());
  }

  status(): ItemStatus {
    if (this.availableUnits() > 0) return 'available';
    return this.purchasedCount() >= this.quantity ? 'purchased' : 'held';
  }

  /** Re-checked at `asOf` rather than trusted from the load: only `statusAt` defines a hold's state. */
  private holdsThatAre(status: 'active' | 'purchased'): number {
    return this._holds.filter((hold) => hold.statusAt(this.asOf) === status).length;
  }
  ```
- **`placeHold`:** drop the `at`, `activeHolds` and `purchasedCount` parameters. Use `this.asOf` wherever it used `props.at`, check `this.availableUnits() === 0`, and `this._holds.push(hold)` before returning.
- **`pledge`:** drop `at` from props, use `this.asOf`, and `this._contributions.push(contribution)` before returning.
- **Docs:** update the doc comments on both methods. They are reached through `Wishlist.holdItem` and `Wishlist.pledge`, and they decide at the item's `asOf`.

- [ ] **Step 5: Run the Item tests**

Run: `npm test -w @gubbins/api -- Item.test`
Expected: PASS. The build fails elsewhere until Step 8.

- [ ] **Step 6: Write the failing Wishlist tests**

In `Wishlist.test.ts`:
- Change `itemOf(wishlistId, overrides)` so it also takes `holds` and `asOf` and passes them to `Item.reconstitute`.
- Change `loaded()` to build `itemOf(WISHLIST_ID, { ...itemOverrides, asOf, holds: [...holds, ...purchased] })` and call `Wishlist.reconstitute({ ...validProps, asOf, keyGen: 1, items: [item] })`.
- Delete the tests you moved to `Item.test.ts`.
- Replace "rejects a hold on an item outside this wishlist" with the item-instant case below.
- Rewrite every test that passes a hold the aggregate didn't load (e.g. "counts an expired hold purchased from outside the load, once") so the hold is loaded: put it in `loaded({ holds })`. A hold that was never loaded is now refused.
- Delete "does not count a hold twice when it was loaded and is then purchased" only if the new "acts on its own instance" case below covers it.

Add:
```ts
it('rejects an item loaded at a different instant from the wishlist', () => {
  const item = itemOf(WISHLIST_ID, { asOf: at(1) });
  expect(() => Wishlist.reconstitute({ ...validProps, keyGen: 1, items: [item] })).toThrow(DomainValidationError);
});

it("findHold finds any hold on the list's items, whatever its state, and none on another list", () => {
  const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
  const wishlist = loaded({ holds: [expired] });
  expect(wishlist.findHold(expired.id.value)).toBe(expired);
  expect(wishlist.findHold(holdOn(OTHER_ITEM_ID).id.value)).toBeNull();
});

it('acts on its own instance of a hold passed as a copy, and counts a purchase once', () => {
  const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
  const wishlist = loaded({ quantity: 2, holds: [expired] });
  const copy = Hold.reconstitute({
    id: expired.id.value, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: SESSION, idempotencyKey: expired.idempotencyKey.value,
    expiresAt: expired.expiresAt, extendedAt: null, releasedAt: null, purchasedAt: null,
  });

  const { hold } = wishlist.purchaseHold(copy);

  expect(hold).toBe(wishlist.findHold(expired.id.value));
  expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
});

it('refuses a command on a hold it did not load, with HoldNotFoundError', () => {
  const wishlist = loaded();
  expect(() => wishlist.releaseHold(holdOn(ITEM_ID))).toThrow(HoldNotFoundError);
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `npm test -w @gubbins/api -- Wishlist.test`
Expected: FAIL. The build fails (`reconstitute` still takes `holds`), and the new cases fail.

- [ ] **Step 8: Make Wishlist delegate to its items**

In `Wishlist.ts`:
- **Fields and docs:** remove `_holds`. Rewrite the class doc comment: the boundary is `Wishlist → Item → Hold / Contribution` (ADR-0078); the wishlist authorizes and owns rules that span items; items decide on their own holds and contributions; the use case appends the returned event and saves the aggregate.
- **`HoldCommandResult`'s doc comment:** "what a hold command returns: the hold it changed, the item whose stream moved, and the event to append at `expectedSeq`".
- **`reconstitute`:** drop `holds`, and replace the hold check with:
  ```ts
  if (items.some((item) => !item.isLoadedAt(props.asOf))) {
    throw new DomainValidationError('Item was loaded at a different instant from its wishlist');
  }
  ```
- **`addItem`:** pass `asOf: this.asOf` in `base`.
- **Replace `get holds()`, `findHold`, `itemStatus`, `purchasedCountOf` and `availableUnitsOf` with:**
  ```ts
  /** Every hold on the list's items: what `save` writes. */
  get holds(): readonly Hold[] { return this._items.flatMap((item) => item.holds); }

  /** Every contribution on the list's items: what `save` writes. */
  get contributions(): readonly Contribution[] { return this._items.flatMap((item) => item.contributions); }

  /** The hold with this id on one of the list's items, or null: a hold on another list is never found. */
  findHold(holdId: string): Hold | null {
    for (const item of this._items) {
      const hold = item.findHold(holdId);
      if (hold) return hold;
    }
    return null;
  }

  itemStatus(itemId: string): ItemStatus { return this.getItem(itemId).status(); }

  purchasedCountOf(itemId: string): number { return this.getItem(itemId).purchasedCount(); }

  availableUnitsOf(itemId: string): number { return this.getItem(itemId).availableUnits(); }
  ```
- **`holdItem`:** `const item = this.getItem(props.itemId); return { item, ...item.placeHold(props, tokens, hasher) };`
- **`pledge`:** `return { item, ...item.pledge(props, ids) };`
- **`itemOf(hold)` becomes `memberOf(hold)`.** It resolves a hold to the aggregate's own instance and its item, so a command never changes a copy that `save` would not see:
  ```ts
  /** The aggregate's own instance of `hold`, and its item; HoldNotFoundError when no item on this list has it. */
  private memberOf(hold: Hold): { item: Item; own: Hold } {
    const item = this._items.find((i) => i.id.value === hold.itemId.value);
    const own = item?.findHold(hold.id.value);
    if (!item || !own) throw new HoldNotFoundError(hold.id.value);
    return { item, own };
  }
  ```
- **`extendHold`, `releaseHold`, `purchaseHold`:** start with `const { item, own } = this.memberOf(hold);`, act on `own`, and return `hold: own`. Remove `this.keep(hold)` from `purchaseHold`, and delete `keep` and `activeHoldsOn`. `purchaseRefusal(own)` is unchanged otherwise.
- **`holdStatus`:** `return this.memberOf(hold).own.statusAt(this.asOf);`.
- **The `can…` predicates:** `canExtendHold`, `canReleaseHold` and `canPurchaseHold` keep `this.owns(hold) && …`.

- [ ] **Step 9: Run the Wishlist tests**

Run: `npm test -w @gubbins/api -- Wishlist.test`
Expected: PASS.

- [ ] **Step 10: Load items with their members**

`ItemRepository.ts`: change `findAllByWishlistId` and add `seqsByWishlistId`:
```ts
/** In the order they were added, each with its holds and contributions, deciding at `members.asOf`. */
findAllByWishlistId(wishlistId: string, members: { asOf: Date; holds: readonly Hold[]; contributions: readonly Contribution[] }): Promise<Item[]>;
/** Each item's stored `seq`, by item id: what `save` compares against. */
seqsByWishlistId(wishlistId: string): Promise<Map<string, number>>;
```
`ItemRepositoryKysely.ts`: `findAllByWishlistId` passes `asOf: members.asOf` and, for each row, the holds and contributions whose `itemId.value === row.id`. Add:
```ts
async seqsByWishlistId(wishlistId: string): Promise<Map<string, number>> {
  const rows = await this.db.selectFrom('item_state')
    .innerJoin('items', 'items.id', 'item_state.item_id')
    .select(['item_state.item_id as id', 'item_state.seq as seq'])
    .where('items.wishlist_id', '=', wishlistId)
    .execute();
  return new Map(rows.map((row) => [row.id, row.seq]));
}
```
`WishlistRepositoryKysely.ts`:
- **Constructor:** add `private contributions: ContributionRepositoryKysely` (built on the same `db`).
- **`hydrate`:**
  ```ts
  const [holds, contributions] = [await this.holds.findForWishlist(row.id), await this.contributions.findForWishlist(row.id)];
  const items = await this.items.findAllByWishlistId(row.id, { asOf: now, holds, contributions });
  ```
  and pass only `items` to `Wishlist.reconstitute`.
- **`save`:** use `await this.items.seqsByWishlistId(wishlist.id.value)` for `storedSeq`. Contributions are not written yet (see Task 5).

- [ ] **Step 11: Update the fakes and builders**

`InMemoryRepositories.ts`:
- **`copyItem(item, members)`:** takes `members: { asOf: Date; holds: readonly Hold[]; contributions: readonly Contribution[] }` and passes them to `Item.reconstitute`.
- **The store keeps item rows without members:** `insert` and `save` store `copyItem(item, { asOf: item's own instant… })`. Because `asOf` is private, store item rows as plain props instead. Change `InMemoryStore.items` to `Map<string, ItemRow>`, where
  ```ts
  type ItemRow = { id: string; wishlistId: string; type: string; title: string; quantity: number; url: string | null; priceMinor: number | null; seq: number };
  const toRow = (item: Item): ItemRow => ({ id: item.id.value, wishlistId: item.wishlistId.value, type: item.type, title: item.title, quantity: item.quantity, url: item.url, priceMinor: item.priceMinor, seq: item.seq });
  ```
  Then update `holdsOnList`, `InMemoryContributionRepository` (`items.get(...)?.wishlistId === wishlistId`, now a string) and `hydrate`:
  ```ts
  const holds = this.store.holdsOnList(wishlist.id.value).map(copyHold);
  const contributions = [...this.store.contributions.values()].filter((c) => this.store.items.get(c.itemId.value)?.wishlistId === wishlist.id.value);
  const items = [...this.store.items.values()].filter((row) => row.wishlistId === wishlist.id.value).map((row) => Item.reconstitute({
    ...row, asOf: now,
    holds: holds.filter((h) => h.itemId.value === row.id),
    contributions: contributions.filter((c) => c.itemId.value === row.id),
  }));
  ```
- **Copies:** `copyItem` is then no longer needed. Delete it, and store `toRow(item)` in `insert` and `save`.

`builders.ts`:
- **`ItemBuilder`:** add `asOf: DEFAULT_AS_OF` to its props, plus `asOf(at: Date): this`.
- **`WishlistBuilder.build()`:** when `purchased > 0`, rebuild the first item with `Item.reconstitute({ id, wishlistId, type: 'single', title, quantity: 1, seq: 0, asOf: this.instant, holds })` and pass `items: [rebuilt, ...items.slice(1)]` with no `holds` prop.

`HoldView.test.ts`: pass `asOf` and `holds` to `Item.reconstitute`, and drop `holds` from `Wishlist.reconstitute`.

- [ ] **Step 12: Run everything**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS. Check the count: `git diff --stat feat/launch/36-load-all-holds...HEAD | tail -1` must show ≤ 10 files.

- [ ] **Step 13: Commit**

```bash
git add -A apps/api/src
git commit -m "refactor(api): holds and contributions live under their item"
```

---

### Task 3a: Money allows zero; the limit bounds an item's pledged total (branch `37a-money-total-cap`)

`Money` stops refusing 0, so an item with no pledges can total `Money.usd(0)`. A pledge still can't be $0: the `Contribution` constructor refuses it, for a new pledge and a stored row alike. `MAX_MONEY_MINOR` moves from a per-pledge bound to a bound on each item's total too, so `pledgedTotal()` is always a valid `Money`. Item prices are unaffected: `Item` checks `priceMinor >= 1` itself (`Item.ts`, the price check).

Two pledges racing past the limit together are covered already: both append at the same `expectedSeq`, one conflicts, and `RetryingUnitOfWork` reloads and re-checks with the first counted (ADR-0010).

**Files:**
- Modify: `apps/api/src/domain/value-objects/Money.ts`
- Modify: `apps/api/src/domain/entities/Contribution.ts`
- Modify: `apps/api/src/domain/entities/Item.ts`
- Test: `apps/api/src/domain/value-objects/Money.test.ts`
- Create: `apps/api/src/domain/entities/Contribution.test.ts`
- Test: `apps/api/src/domain/entities/Item.test.ts`

**Interfaces:**
- Consumes: Task 3's `Item` (`_contributions`, `reconstitute({ …, contributions })`).
- Produces:
  - `Money.usd(amountMinor)` accepts `0 … MAX_MONEY_MINOR`.
  - `item.pledgedTotal(): Money`. The sum of its contributions, `Money.usd(0)` with none.
  - `Item.reconstitute` throws `DomainValidationError` when its contributions total more than `MAX_MONEY_MINOR`; `Contribution.create` and `reconstitute` throw it for an amount of 0.
  - `item.pledge` throws `ContributionAmountError` for a pledge that would take the total past `MAX_MONEY_MINOR`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/37a-money-total-cap
```

- [ ] **Step 2: Write the failing tests**

`Money.test.ts`, replace the body of `describe('Money.usd')`:
```ts
it.each([-1, 1.5, 10 ** 12 + 1, Number.NaN])('refuses %j', (v) => {
  expect(() => Money.usd(v)).toThrow(DomainValidationError);
});
it.each([0, 2500, 10 ** 12])('keeps %j', (v) => {
  expect(Money.usd(v).amountMinor).toBe(v);
});
```

`Contribution.test.ts` (new):
```ts
import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { Contribution } from './Contribution.js';

const row = {
  id: '44444444-4444-7444-8444-444444444444', itemId: '33333333-3333-7333-8333-333333333333', sessionHash: 'a'.repeat(64),
  idempotencyKey: 'k1', piiRef: '55555555-5555-7555-8555-555555555555', pledgedAt: new Date('2026-10-13T10:00:00Z'),
};

describe('Contribution', () => {
  it('refuses a pledge of zero, even from a stored row', () => {
    expect(() => Contribution.reconstitute({ ...row, amountMinor: 0 })).toThrow(DomainValidationError);
  });
  it('keeps a pledge of one cent', () => {
    expect(Contribution.reconstitute({ ...row, amountMinor: 1 }).amount.amountMinor).toBe(1);
  });
});
```

`Item.test.ts`, inside `describe('Item.pledge')`, add a helper and cases. `pledged(amountMinor)` builds a stored contribution on `ITEM_ID`, and `fundedGroup(...amounts)` reconstitutes a group item priced at `MAX_MONEY_MINOR`, so one pledge may be as large as the limit:
```ts
const pledged = (amountMinor: number, n = 1) => Contribution.reconstitute({
  id: `66666666-6666-7666-8666-${String(n).padStart(12, '0')}`, itemId: ITEM_ID, amountMinor,
  sessionHash: 'a'.repeat(64), idempotencyKey: `stored-${n}`, piiRef: PII, pledgedAt: T0,
});
const fundedGroup = (...amounts: number[]) => Item.reconstitute({
  ...base, type: 'group', priceMinor: MAX_MONEY_MINOR, contributions: amounts.map((a, i) => pledged(a, i + 1)),
});

it('totals its pledges, zero with none', () => {
  const item = group();
  expect(item.pledgedTotal().amountMinor).toBe(0);
  item.pledge({ ...props, amountMinor: 2_500 }, ids);
  expect(item.pledgedTotal().amountMinor).toBe(2_500);
});
it('accepts a pledge that brings the total exactly to 10¹² minor units, and refuses one cent more', () => {
  const item = fundedGroup(MAX_MONEY_MINOR - 100);
  expect(() => item.pledge({ ...props, amountMinor: 100 }, ids)).not.toThrow();
  expect(() => item.pledge({ ...props, idempotencyKey: 'k2', amountMinor: 1 }, ids)).toThrow(ContributionAmountError);
});
it('rejects loaded pledges that total more than 10¹² minor units', () => {
  expect(() => fundedGroup(MAX_MONEY_MINOR, 1)).toThrow(DomainValidationError);
});
```
Import `Contribution` from `./Contribution.js` and `MAX_MONEY_MINOR` from `../value-objects/Money.js`. `T0` comes from Task 3.

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -w @gubbins/api -- Money.test Contribution.test Item.test`
Expected: FAIL (`Money.usd(0)` throws; no `pledgedTotal`; the over-limit cases don't throw).

- [ ] **Step 4: Implement**

`Money.ts`:
```ts
if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > MAX_MONEY_MINOR) {
  throw new DomainValidationError('Money must be a whole number of minor units from zero to the limit');
}
```

`Contribution.ts`, give the constructor a body:
```ts
) {
  // Money allows zero, for totals; a pledge of nothing is not a pledge.
  if (amount.amountMinor === 0) throw new DomainValidationError('A pledge must be more than zero');
}
```
Import `DomainValidationError` from `../errors.js`.

`Item.ts`:
- **Constructor**, after the other-item check from Task 3:
  ```ts
  if (sumMinor(_contributions) > MAX_MONEY_MINOR) throw new DomainValidationError('Pledges on an item total more than the limit');
  ```
- **`pledge`**, after the per-pledge check:
  ```ts
  // ADR-0061: the guard bounds the total too, so pledgedTotal() is always a valid Money.
  if (sumMinor(this._contributions) + props.amountMinor > MAX_MONEY_MINOR) throw new ContributionAmountError(this.id.value);
  ```
- **New query:**
  ```ts
  /** The sum of its pledges. Derived, never stored. */
  pledgedTotal(): Money {
    return Money.usd(sumMinor(this._contributions));
  }
  ```
- **Module-level helper**, below the constants:
  ```ts
  const sumMinor = (contributions: readonly Contribution[]): number => contributions.reduce((sum, c) => sum + c.amount.amountMinor, 0);
  ```
- Update the `pledge` doc comment: overfunding is allowed up to `MAX_CONTRIBUTION_TARGET_MULTIPLE` times the price per pledge (ADR-0047), and the item's total stays within `MAX_MONEY_MINOR` (ADR-0061).

- [ ] **Step 5: Run everything**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS. Check the count: `git diff --stat feat/launch/37-holds-under-item...HEAD | tail -1` must show ≤ 10 files (6 expected).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain
git commit -m "feat(api): an item's pledged total stays within the money limit"
```

---

### Task 4: Replay and session queries in the domain (branch `37b-replay-in-domain`)

The first callers arrive in Tasks 5 and 6. Say so in the PR body.

**Files:**
- Modify: `apps/api/src/domain/entities/Item.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Test: `apps/api/src/domain/entities/Item.test.ts`
- Test: `apps/api/src/domain/entities/Wishlist.test.ts`
- Test (only if Task 3 Step 12 was deferred): `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`

**Interfaces:**
- Consumes: Task 3's `Item` and `Wishlist`.
- Produces:
  - `item.findHoldWithKey(idempotencyKey: string): Hold | null`
  - `item.findContributionWithKey(idempotencyKey: string): Contribution | null`
  - `wishlist.findHoldForReplay(itemId: string, idempotencyKey: string, sessionHash: string): Hold | null`
  - `wishlist.findContributionForReplay(itemId: string, idempotencyKey: string, sessionHash: string): Contribution | null`
  - `wishlist.holdsForSession(sessionHash: string): Hold[]`

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/37b-replay-in-domain
```

- [ ] **Step 2: Write the failing tests**

`Item.test.ts`:
```ts
describe('Item lookups', () => {
  it('finds its own hold and contribution by idempotency key, or null', () => {
    const hold = holdOn({ idempotencyKey: 'tap-1' });
    const item = Item.reconstitute({ ...base, holds: [hold] });
    expect(item.findHoldWithKey('tap-1')).toBe(hold);
    expect(item.findHoldWithKey('tap-2')).toBeNull();
    expect(item.findContributionWithKey('tap-1')).toBeNull();
  });
});
```
`Wishlist.test.ts`:
```ts
describe('Wishlist.findHoldForReplay', () => {
  it("returns the session's own hold for a key it already used, even once that hold has expired", () => {
    const hold = holdOn(ITEM_ID, { idempotencyKey: 'tap-1', expiresAt: at(-1) });
    expect(loaded({ holds: [hold] }).findHoldForReplay(ITEM_ID, 'tap-1', SESSION)).toBe(hold);
  });

  it("refuses another session's key with ItemUnavailableError", () => {
    const hold = holdOn(ITEM_ID, { idempotencyKey: 'tap-1' });
    expect(() => loaded({ holds: [hold] }).findHoldForReplay(ITEM_ID, 'tap-1', OTHER_SESSION)).toThrow(ItemUnavailableError);
  });

  it('returns null for a key not used on that item', () => {
    expect(loaded().findHoldForReplay(ITEM_ID, 'tap-1', SESSION)).toBeNull();
  });

  it('throws ItemNotFoundError for an item not on this list', () => {
    expect(() => loaded().findHoldForReplay(OTHER_ITEM_ID, 'tap-1', SESSION)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.findContributionForReplay', () => {
  const pledged = Contribution.reconstitute({
    id: '77777777-7777-7777-8777-777777777777', itemId: ITEM_ID, amountMinor: 2_500, sessionHash: SESSION,
    idempotencyKey: 'p-1', piiRef: '66666666-6666-7666-8666-666666666666', pledgedAt: T0,
  });
  const withPledge = () => Wishlist.reconstitute({
    ...validProps, keyGen: 1,
    items: [Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'group', title: 'Mixer', quantity: 1, priceMinor: 10_000, seq: 1, asOf: T0, contributions: [pledged] })],
  });

  it("returns the session's own pledge for a key it already used", () => {
    expect(withPledge().findContributionForReplay(ITEM_ID, 'p-1', SESSION)).toBe(pledged);
  });

  it("refuses another session's key with ItemUnavailableError", () => {
    expect(() => withPledge().findContributionForReplay(ITEM_ID, 'p-1', OTHER_SESSION)).toThrow(ItemUnavailableError);
  });

  it('returns null for a key not used on that item', () => {
    expect(withPledge().findContributionForReplay(ITEM_ID, 'p-2', SESSION)).toBeNull();
  });
});

describe('Wishlist.holdsForSession', () => {
  it("returns every hold that session placed on the list, whatever its state, and no one else's", () => {
    const mine = [holdOn(ITEM_ID), holdOn(ITEM_ID, { releasedAt: T0 }), holdOn(ITEM_ID, { expiresAt: at(-1) })];
    const theirs = holdOn(ITEM_ID, { sessionHash: OTHER_SESSION });
    const wishlist = loaded({ quantity: 4, holds: [...mine, theirs] });
    expect(wishlist.holdsForSession(SESSION)).toEqual(mine);
  });
});
```
Import `Contribution` from `./Contribution.js` in `Wishlist.test.ts`. The wishlist needs `paymentMethods` only to *add* a group item, not to reconstitute one.

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -w @gubbins/api -- entities`
Expected: FAIL (methods missing; a type error at build).

- [ ] **Step 4: Implement**

`Item.ts`:
```ts
findHoldWithKey(idempotencyKey: string): Hold | null {
  return this._holds.find((hold) => hold.idempotencyKey.value === idempotencyKey) ?? null;
}

findContributionWithKey(idempotencyKey: string): Contribution | null {
  return this._contributions.find((c) => c.idempotencyKey.value === idempotencyKey) ?? null;
}
```
`Wishlist.ts`:
```ts
/**
 * The hold an earlier tap with this key placed, so a replay answers with it
 * rather than placing another. Another session's key never hands over that
 * session's hold: it is refused like a unit someone else holds.
 */
findHoldForReplay(itemId: string, idempotencyKey: string, sessionHash: string): Hold | null {
  return this.replayOf(this.getItem(itemId).findHoldWithKey(idempotencyKey), itemId, sessionHash);
}

/** `findHoldForReplay`'s rule for a pledge. */
findContributionForReplay(itemId: string, idempotencyKey: string, sessionHash: string): Contribution | null {
  return this.replayOf(this.getItem(itemId).findContributionWithKey(idempotencyKey), itemId, sessionHash);
}

/** Every hold `sessionHash` placed on the list, whatever its state. */
holdsForSession(sessionHash: string): Hold[] {
  return this.holds.filter((hold) => hold.belongsToSession(sessionHash));
}

private replayOf<T extends { belongsToSession(sessionHash: string): boolean }>(found: T | null, itemId: string, sessionHash: string): T | null {
  if (found && !found.belongsToSession(sessionHash)) throw new ItemUnavailableError(itemId);
  return found;
}
```
Import `ItemUnavailableError` in `Wishlist.ts`.

- [ ] **Step 5: Run the tests**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): the wishlist decides idempotent replays and a session's holds"
```

---

### Task 5: Commands go through the aggregate only (branch `38-commands-via-aggregate`)

**Files:**
- Modify: `apps/api/src/application/use-cases/HoldItem.ts`
- Modify: `apps/api/src/application/use-cases/PledgeContribution.ts`
- Modify: `apps/api/src/application/use-cases/holdCommand.ts`
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Modify: `apps/api/src/application/ports/WishlistRepository.ts`
- Test: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`
- Test: `apps/api/src/application/use-cases/PledgeContribution.test.ts` (only if a case reads through `ctx.contributions`)

**Interfaces:**
- Consumes: `wishlist.findHoldForReplay`, `wishlist.findContributionForReplay`, `wishlist.findHold`, `wishlist.contributions` (Tasks 3–4).
- Produces: `WishlistRepository.save` also inserts contributions not yet stored. `findOwnedHold` is deleted.

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/38-commands-via-aggregate
```

- [ ] **Step 2: Write the failing contract cases**

The contract file needs a group item to pledge on. Add to `wishlistRepository.contract.ts`:
```ts
it('save inserts a pledge the aggregate made, once: a second save inserts nothing', async () => {
  await fx.seedGuestPii(PII_REF);
  const list = Wishlist.create({ id: LIST_C, slug: 'list-c', title: 'C', ownerToken: 'o', key: 'k', asOf: NOW,
    paymentMethods: PaymentMethods.from({ venmoHandle: 'my-venmo' }) });
  list.addItem({ type: 'group', title: 'Mixer', priceMinor: 45_000 }, { generateEntityId: () => ITEM_C2 });
  await fx.wishlists.insert(list);
  const wishlist = (await fx.wishlists.findById(LIST_C, NOW))!;
  wishlist.pledge({ itemId: ITEM_C2, amountMinor: 2_500, sessionHash: SESSION, idempotencyKey: 'p-1', piiRef: PII_REF },
    { generateEntityId: () => '00000000-0000-7000-8000-888888888888' });

  await fx.wishlists.save(wishlist);
  await fx.wishlists.save(wishlist);

  expect((await fx.wishlists.findById(LIST_C, NOW))?.getItem(ITEM_C2).pledgedTotal().amountMinor).toBe(2_500);
});

it('save writes a released and an expired hold back unchanged', async () => {
  const released = holdFixture({ releasedAt: later(-5) });
  const expired = holdFixture({ expiresAt: later(-1) });
  for (const hold of [released, expired]) await fx.holds.insert(hold);

  await fx.wishlists.save((await fx.wishlists.findById(LIST_A, NOW))!);

  const reloaded = await fx.wishlists.findById(LIST_A, NOW);
  expect(reloaded?.findHold(released.id.value)?.releasedAt).toEqual(later(-5));
  expect(reloaded?.findHold(expired.id.value)?.expiresAt).toEqual(later(-1));
});
```
with `const PII_REF = '00000000-0000-7000-8000-00000000aaaa';` at the top. `seedGuestPii` makes the `guest_pii` row that the contribution's `pii_ref` foreign key needs.

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -w @gubbins/api -- contracts`
Expected: the pledge case FAILS (total 0, since `save` writes no contributions). The hold case passes already; it guards the `shortcut:` loop in `save`.

- [ ] **Step 4: Make save insert new contributions**

`WishlistRepository.ts`, the `save` doc gains: "…then contributions it pledged that are not yet stored. A contribution is never updated."

`WishlistRepositoryKysely.save`, after the holds:
```ts
// After the items, so a new contribution's item row already exists. Pledges are never updated, only added.
const contributionIds = wishlist.contributions.map((c) => c.id.value);
const storedContributions = contributionIds.length === 0 ? new Set<string>()
  : new Set((await this.db.selectFrom('contributions').select('id').where('id', 'in', contributionIds).execute()).map((row) => row.id));
for (const contribution of wishlist.contributions) {
  if (!storedContributions.has(contribution.id.value)) await this.contributions.insert(contribution);
}
```
`InMemoryWishlistRepository.save`, after the holds:
```ts
const contributions = new InMemoryContributionRepository(this.store);
for (const contribution of wishlist.contributions) {
  if (!this.store.contributions.has(contribution.id.value)) await contributions.insert(contribution);
}
```

- [ ] **Step 5: Move the use cases onto the aggregate**

`HoldItem.ts`, replace the `existing` block with:
```ts
// Before placing a hold, so a replayed key answers with the hold it placed,
// not ItemUnavailableError on that very hold.
const replay = wishlist.findHoldForReplay(input.itemId, input.idempotencyKey, guest.sessionHash);
if (replay) return toHoldView(wishlist, replay);
```
Delete the now-redundant `wishlist.getItem(input.itemId);` line above it, since `findHoldForReplay` resolves the item. Drop the `ItemUnavailableError` import if unused.

`PledgeContribution.ts`:
- Replace the `existing` block with:
  ```ts
  // Before pledging, so a replayed key answers with the original pledge.
  const replay = wishlist.findContributionForReplay(input.itemId, input.idempotencyKey, guest.sessionHash);
  if (replay) return toResponse(replay);
  ```
- Delete `wishlist.getItem(input.itemId);` and `await ctx.contributions.insert(contribution);`. `save` writes it now.
- The comment above `guestPii.insert` stays.

`holdCommand.ts`:
- Delete `findOwnedHold`.
- In `runHoldCommand`, replace `const hold = await findOwnedHold(ctx, wishlist, input.holdId);` with:
  ```ts
  // Unknown, malformed and another list's hold ids all fail alike (IDOR): the aggregate only finds its own.
  const hold = wishlist.findHold(input.holdId);
  if (!hold) throw new HoldNotFoundError(input.holdId);
  ```
- Update `runHoldCommand`'s doc comment ("load the list, find the caller's hold on it, check permission, let the wishlist decide, append and save"), and drop now-unused imports.

- [ ] **Step 6: Run everything**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS, including the unchanged `onOtherList` cases in `ExtendHold.test.ts`, `ReleaseHold.test.ts` and `MarkHoldPurchased.test.ts`, and the replay cases in `HoldItem.test.ts` and `PledgeContribution.test.ts`. If a use-case test fails because it seeded or read through `ctx.contributions` or `ctx.holds`, change only that test's seeding or reading to go through `persistence.store`. Don't change its assertion.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): hold and pledge commands persist through the wishlist only"
```

---

### Task 6: The list view reads from the aggregate (branch `39-list-view-from-aggregate`)

**Files:**
- Modify: `apps/api/src/application/use-cases/GetListView.ts`
- Test: `apps/api/src/application/use-cases/GetListView.test.ts` (only if it seeds through ports that this change bypasses)

**Interfaces:**
- Consumes: `wishlist.holdsForSession` (Task 4), `item.pledgedTotal()` (Task 3a).

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/39-list-view-from-aggregate
```

- [ ] **Step 2: Confirm the existing tests pin the behaviour**

Run: `npm test -w @gubbins/api -- GetListView`
Expected: PASS. Read the file and confirm it has cases for: pledged total on a group gift; `null` for a single; my holds excluding released and including expired, oldest expiry first; another session's holds absent. If one is missing, add it now and see it pass against the current code before you refactor.

- [ ] **Step 3: Refactor**

In `GetListView.ts`, replace the two port reads:
```ts
const mine = access.guestSession ? wishlist.holdsForSession(access.guestSession.sessionHash) : [];
```
and in the item mapping:
```ts
pledgedMinor: i.type === 'group' ? i.pledgedTotal().amountMinor : null,
```
Delete the `pledged` variable.

- [ ] **Step 4: Run everything**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS, with GetListView's tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): the list view reads holds and pledges from the wishlist"
```

---

### Task 7: Tests read rows without the port lookups (branch `40a-tests-read-rows`)

These lookups are deleted in Task 8, so their test callers move first.

**Files:**
- Test: `apps/api/src/application/use-cases/ExtendHold.test.ts`
- Test: `apps/api/src/application/use-cases/HoldItem.test.ts`
- Test: `apps/api/src/application/test-fakes/InMemoryRepositories.test.ts`
- Test: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`

**Interfaces:** none produced.

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/40a-tests-read-rows
```

- [ ] **Step 2: Rewrite the reads**

- **`ExtendHold.test.ts:35`:** `expect(store.holds.get(holdId)?.extendedAt).toEqual(T0);`. Destructure `store` from the scenario.
- **`HoldItem.test.ts:46,65,87`:** replace `(await holds.findByIdempotencyKey(ITEM_ID, 'idem-1'))` with `[...store.holds.values()].find((h) => h.idempotencyKey.value === 'idem-1')`.
- **`InMemoryRepositories.test.ts`:** rewrite the third case so it no longer uses `holds.insert` or `holds.findById`:
  ```ts
  it('does not let a caller change a stored hold through the instance it saved', async () => {
    const { wishlists } = inMemoryPersistence();
    await wishlists.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    const wishlist = (await wishlists.findById(WISHLIST_ID, T0))!;
    const { hold } = wishlist.holdItem(holdProps, tokens, hasher);
    await wishlists.save(wishlist);

    wishlist.releaseHold(hold);

    expect((await wishlists.findById(WISHLIST_ID, T0))?.findHold(hold.id.value)?.releasedAt).toBeNull();
  });
  ```
- **`wishlistRepository.contract.ts`:** in `'save inserts a hold the aggregate placed'`, read `(await fx.wishlists.findById(LIST_A, NOW))?.findHold(hold.id.value)?.expiresAt`. Replace any remaining `fx.holds.findById` the same way.

- [ ] **Step 3: Run everything**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src
git commit -m "test(api): read stored holds through the aggregate or the fake's rows"
```

---

### Task 8: Hold and contribution ports leave the use cases (branch `40b-drop-hold-ports`)

**Files:**
- Modify: `apps/api/src/application/ports/UnitOfWork.ts`
- Modify: `apps/api/src/infrastructure/UnitOfWorkKysely.ts`
- Modify: `apps/api/src/application/ports/HoldRepository.ts`
- Modify: `apps/api/src/application/ports/ContributionRepository.ts`
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/ContributionRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Test: `apps/api/src/application/ports/contracts/holdRepository.contract.ts`
- Test: `apps/api/src/application/ports/contracts/contributionRepository.contract.ts`

**Interfaces:**
- Produces:
  - `TransactionContext = { wishlists; eventStore; guestPii }`
  - `HoldRepository = { insert; save; findForWishlist }`
  - `ContributionRepository = { insert; findForWishlist }`

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/launch/40b-drop-hold-ports
```

- [ ] **Step 2: Narrow the context**

`UnitOfWork.ts`:
- Remove `holds` and `contributions` and their imports.
- Extend the doc comment: "Nor `holds` or `contributions`: they are entities of the same aggregate (ADR-0078), loaded and saved with it."

`UnitOfWorkKysely.ts`: stop building the hold and contribution repositories for the context, and remove the unused imports.

- [ ] **Step 3: Narrow the ports**

`HoldRepository.ts`:
- Keep `insert`, `save` and `findForWishlist`, and delete the rest.
- Rewrite the interface doc: "The `Wishlist` repository's collaborator for hold rows (ADR-0078), not a use-case-facing port. Every method's behaviour is pinned by `holdRepository.contract.ts` against every implementation."

`ContributionRepository.ts`: keep `insert` and `findForWishlist`, with the same doc treatment.

- [ ] **Step 4: Delete the implementations**

- **`HoldRepositoryKysely`:** delete `findById`, `findByIdempotencyKey`, `findActiveOrPurchasedForWishlist` and `findForSession`. In the `lifecycleColumns` comment, drop the sentence naming `findActiveOrPurchasedForWishlist`, and keep the one-fixed-shape reason.
- **`ContributionRepositoryKysely`:** delete `findByIdempotencyKey` and `pledgedTotals`. Drop the `sql` import if unused.
- **`InMemoryRepositories.ts`:**
  - Delete the same methods on the fakes, and `InMemoryStore.activeOrPurchasedHoldsOnList`.
  - `inMemoryPersistence()` builds `InMemoryUnitOfWork({ wishlists, eventStore, guestPii })`. Keep returning `holds` and `contributions`, because tests seed rows through them.

- [ ] **Step 5: Rewrite the contract suites against what remains**

`holdRepository.contract.ts`:
- Delete the `findById`, `findByIdempotencyKey`, `findActiveOrPurchasedForWishlist` and `findForSession` cases.
- Keep these behaviours, now read back through `findForWishlist(LIST_A)`:
  - insert round-trips a hold, `piiRef` included;
  - insert refuses an unknown `piiRef` (the foreign key);
  - insert refuses a second hold with the same `(item, idempotencyKey)`;
  - save persists the lifecycle.
- For example, the round-trip becomes `expect(await fx.holds.findForWishlist(LIST_A)).toEqual([hold]);`.

`contributionRepository.contract.ts`:
- Delete the `findByIdempotencyKey` and `pledgedTotals` cases.
- Keep insert's round-trip, plus the UNIQUE `(item, idempotencyKey)` refusal and its "same key on another item is fine" counterpart, read through `findForWishlist`.

- [ ] **Step 6: Run everything, web included**

Run: `npm run build -w @gubbins/shared-types && npm run build -w @gubbins/api && npm test -w @gubbins/api && npm test -w @gubbins/web -- --testTimeout=30000`
Expected: PASS. Then `grep -rn "ctx\.holds\|ctx\.contributions\|findOwnedHold" apps/api/src`. Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): hold and contribution repositories serve the wishlist adapter only"
```

---

## After the last task

- **Count files per branch:** `git diff --stat <parent>...<branch> | tail -1` must show ≤ 10 for each of 35 … 40b.
- **Opening the PRs:** they open after 33 and 34, at most 8 open at once, with bodies written using the writing-pr-descriptions skill. Tasks 2 and 4 name the PR that first uses the code they add.
