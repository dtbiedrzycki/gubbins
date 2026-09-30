# PR #7 Domain Review Follow-up Implementation Plan

> **Status: carried out on 2026-09-14; kept as a record, not as instructions.**
> Do not execute this plan. Several of its resolutions were revised later in
> the stack as the layers below PR #7 were built out:
>
> - **Task 1** went further than planned. Rather than a branded
>   `createUuidId(brand)` factory keeping `WishlistId`/`ItemId`/`HoldId` as
>   distinct types, those three files were removed outright in favour of a
>   single `UuidId` class — a dedicated id class can be split back out if one
>   ever needs an invariant the others don't.
> - **Task 3** was superseded outright — see the note in that section.
> - **Task 5** shipped only in part: `Wishlist.getItem(itemId)` exists,
>   `authorizeHold` does not.
>
> Tasks 2 and 4 shipped as written, Task 4 with `generateEntityId` rather than
> `generateId` following ADR-0076.
>
> The original agentic-worker banner read: *REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.* That
> instruction applied while the work was live and is recorded here rather than
> left in force.

**Goal:** Resolve the five outstanding review comments on PR #7 (`feat/walking-skeleton/03-domain`) — consolidate the id value objects, add `SessionHash`/`IdempotencyKey` value objects, move item-view composition onto `Item`, have `Wishlist` mint its own item ids, and require a resolved `Item` (not a raw string) for `authorizeHold` — then propagate the resulting `Wishlist` API changes through the already-built downstream stack (PRs #8–#20).

**Architecture:** All new domain logic lands on `feat/walking-skeleton/03-domain` (PR #7), the same zero-imports-outside-`domain/` layer it already lives in. Two of the five changes alter `Wishlist`'s public API (`addItem`, `authorizeHold`); everything downstream of PR #7 was already built stacked on the old signatures, so those changes ripple via rebase into the branches whose own commits call those methods: `04-ports` (test builder), `05-create-and-key` (`CreateList`), `06-hold-item` (`HoldItem`), and `07-persistence` (an integration test that calls `addItem` directly). Branches `08` through `16` carry these files forward unmodified in their own diffs and need only a rebase and a test run — confirmed by inspecting each branch's diff against its parent, no other branch touches `Wishlist.ts`, `CreateList.ts`, `HoldItem.ts`, `builders.ts`, or `persistence.integration.test.ts`.

**Tech Stack:** TypeScript (ESM), Vitest 2, ESLint, `gh` CLI for GitHub — same as the rest of the walking-skeleton stack.

**Spec:** No design spec — this is direct follow-up to reviewer feedback on already-implemented code, not new spec-driven work. Source: five unanswered threads from dtbiedrzycki's 2026-09-14 review round on https://github.com/dtbiedrzycki/gubbins/pull/7 (comment ids given per task below), resolved through follow-up discussion in this session.

## Global Constraints

- Domain layer has zero imports outside `domain/` (ADR-012). Any application-layer capability the domain needs (id generation, comparers) is taken as a **structurally-typed parameter**, never an imported interface — the existing precedent is `HoldSecret.matches(candidate, comparer)`, where `comparer: { constantTimeEqual(a, b): boolean }` is inline-typed.
- Entities are constructed only via static factories, never a public constructor — preserve this for every entity touched here.
- One commit per task, covering every file touched in that task (existing project convention — see `docs/superpowers/plans/2026-09-12-walking-skeleton.md`).
- Verify each layer with the same commands its own PR's test plan uses: `cd apps/api && npx vitest run src/domain && npx eslint src/domain` for domain-only tasks; widen the `vitest run`/`eslint` path to match whichever layer a downstream task touches (e.g. `src/application`, `src/infrastructure`).
- Scope discipline: `Wishlist.create` and `Hold.create` keep taking pre-generated `id`/`ownerToken`/`key`/`secret` strings from the caller, unchanged — only `Wishlist.addItem` changes to mint its own id. This was confirmed with the user; do not generalize the id-generator-injection pattern beyond `addItem` without asking first.
- **Rebasing branches `04-ports` through `16-e2e-and-verification` force-pushes 13 already-open PRs (#8–#20).** This is a hard-to-reverse action visible to anyone watching those PRs. Confirm with the user before the first force-push, even though this plan as a whole has been discussed with them.
- Posting replies to GitHub review threads (Task 6) is also visible to others — confirm before posting, or post as you go and let the user review after the fact if they've said that's fine.

---

## Task 1: Consolidate `WishlistId`/`ItemId`/`HoldId` into a shared branded-UUID factory

**Branch:** `feat/walking-skeleton/03-domain` (PR #7)
**Resolves:** issue comment [5658231451](https://github.com/dtbiedrzycki/gubbins/pull/7#issuecomment-5658231451) — "Should the id value objects be refactored into a single object until more types are necessary?"

`WishlistId`, `ItemId`, and `HoldId` are byte-for-byte identical except their brand string and error message. `Slug` stays separate — different regex, different concept.

**Files:**
- Create: `apps/api/src/domain/value-objects/UuidId.ts`
- Create: `apps/api/src/domain/value-objects/UuidId.test.ts`
- Modify: `apps/api/src/domain/value-objects/WishlistId.ts` (replace entire file)
- Modify: `apps/api/src/domain/value-objects/ItemId.ts` (replace entire file)
- Modify: `apps/api/src/domain/value-objects/HoldId.ts` (replace entire file)

**Interfaces:**
- Produces: `createUuidId<Brand extends string>(brand: Brand)` — a function returning a class with a private constructor and `static from(value: string)`. `WishlistId`/`ItemId`/`HoldId` re-export this via the value+type declaration-merging pattern (`export const X = createUuidId('X'); export type X = ReturnType<typeof X.from>;`), so `X.from(...)` as a value and `: X` as a type both keep working exactly as before everywhere else in the codebase — no other file changes as a result of this task.
- This pattern was verified to type-check correctly (including that two different brands are NOT mutually assignable) with a standalone `tsc --strict` run before writing this plan.

- [ ] **Step 1: Write the failing test** — `apps/api/src/domain/value-objects/UuidId.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createUuidId } from './UuidId.js';
import { DomainValidationError } from '../errors.js';

describe('createUuidId', () => {
  const TestId = createUuidId('TestId');

  it('accepts a valid UUID v4', () => {
    const id = TestId.from('11111111-1111-4111-8111-111111111111');
    expect(id.value).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects a value that is not a valid UUID v4', () => {
    expect(() => TestId.from('not-a-uuid')).toThrow(DomainValidationError);
  });

  it('includes the brand name in the error message', () => {
    expect(() => TestId.from('nope')).toThrow('TestId must be a valid UUID v4');
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cd apps/api && npx vitest run src/domain/value-objects/UuidId.test.ts`
Expected: FAIL — `Cannot find module './UuidId.js'`

- [ ] **Step 3: Implement the factory** — `apps/api/src/domain/value-objects/UuidId.ts`

```ts
import { DomainValidationError } from '../errors.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Builds a nominally-branded UUID v4 value-object class for one entity's
 * identity. WishlistId/ItemId/HoldId were byte-for-byte identical except
 * their brand and error text, so this factory is the one place that logic
 * lives — split an id back out of it only once it needs behavior the
 * others don't. The `Brand` type parameter (not just the runtime string)
 * is what makes two calls to this factory produce mutually-incompatible
 * types: the private `_brand` field's type is tied to `Brand`, so
 * `createUuidId('ItemId')`'s instances structurally differ from
 * `createUuidId('WishlistId')`'s even though both classes are declared
 * from the same source.
 */
export function createUuidId<Brand extends string>(brand: Brand) {
  class UuidId {
    private readonly _brand: Brand = brand;

    private constructor(readonly value: string) {}

    static from(value: string): UuidId {
      if (!UUID_V4_PATTERN.test(value)) {
        throw new DomainValidationError(`${brand} must be a valid UUID v4`);
      }
      return new UuidId(value);
    }
  }
  return UuidId;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/api && npx vitest run src/domain/value-objects/UuidId.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Replace `WishlistId.ts`**

```ts
import { createUuidId } from './UuidId.js';

/**
 * A wishlist's identity. Branded separately from ItemId/HoldId so a value
 * meant for a different entity can't be passed where a WishlistId is
 * expected and compile silently (same rationale as the bearer-secret VOs).
 */
export const WishlistId = createUuidId('WishlistId');
export type WishlistId = ReturnType<typeof WishlistId.from>;
```

- [ ] **Step 6: Replace `ItemId.ts`**

```ts
import { createUuidId } from './UuidId.js';

/**
 * An item's identity. Branded separately from WishlistId/HoldId so a value
 * meant for a different entity can't be passed where an ItemId is expected
 * and compile silently (same rationale as the bearer-secret VOs).
 */
export const ItemId = createUuidId('ItemId');
export type ItemId = ReturnType<typeof ItemId.from>;
```

- [ ] **Step 7: Replace `HoldId.ts`**

```ts
import { createUuidId } from './UuidId.js';

/**
 * A hold's identity. Branded separately from WishlistId/ItemId so a value
 * meant for a different entity can't be passed where a HoldId is expected
 * and compile silently (same rationale as the bearer-secret VOs).
 */
export const HoldId = createUuidId('HoldId');
export type HoldId = ReturnType<typeof HoldId.from>;
```

- [ ] **Step 8: Run the full domain suite to confirm no regression**

Run: `cd apps/api && npx vitest run src/domain && npx eslint src/domain`
Expected: PASS — `Wishlist.test.ts`, `Item.test.ts`, `Hold.test.ts` already exercise "rejects an id that is not a valid UUID" and must still pass unchanged, since `WishlistId.from`/`ItemId.from`/`HoldId.from` keep the same signature and error text pattern.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/domain/value-objects/UuidId.ts apps/api/src/domain/value-objects/UuidId.test.ts \
        apps/api/src/domain/value-objects/WishlistId.ts apps/api/src/domain/value-objects/ItemId.ts \
        apps/api/src/domain/value-objects/HoldId.ts
git commit -m "refactor(domain): consolidate WishlistId/ItemId/HoldId into a shared UUID VO factory"
```

---

## Task 2: Add `SessionHash` and `IdempotencyKey` value objects

**Branch:** `feat/walking-skeleton/03-domain` (PR #7)
**Resolves:** review comment [4001825239](https://github.com/dtbiedrzycki/gubbins/pull/7#discussion_r4001825239) (`Hold.ts:12`) — "Should these be value objects?"

`sessionHash` is always a SHA-256 hex digest (`HasherSha256.hash()`, `apps/api/src/infrastructure/HasherSha256.ts`) — 64 lowercase hex characters. `idempotencyKey` is client-generated (ADR-048; the web client uses `crypto.randomUUID()`) with no format mandated by the HTTP-boundary zod schema (`packages/shared-types/src/holdItem.ts`: `z.string().trim().min(1)`) beyond non-empty — bound it at 200 characters as defense-in-depth, matching `Slug`'s rationale for bounding otherwise-unconstrained input at the domain boundary.

**Files:**
- Create: `apps/api/src/domain/value-objects/SessionHash.ts`
- Create: `apps/api/src/domain/value-objects/SessionHash.test.ts`
- Create: `apps/api/src/domain/value-objects/IdempotencyKey.ts`
- Create: `apps/api/src/domain/value-objects/IdempotencyKey.test.ts`
- Modify: `apps/api/src/domain/entities/Hold.ts` (replace entire file)
- Modify: `apps/api/src/domain/entities/Hold.test.ts` (replace entire file)

**Interfaces:**
- Consumes: `DomainValidationError` from `../errors.js` (existing).
- Produces: `Hold.sessionHash: SessionHash` and `Hold.idempotencyKey: IdempotencyKey` (previously `string`). `Hold.create`'s input props are unchanged (`sessionHash: string; idempotencyKey: string`) — conversion happens inside `create()`, same pattern as `HoldSecret.from(props.secret)`. **This is a breaking change for any caller reading `hold.sessionHash`/`hold.idempotencyKey` as a string** — see Task 9 (`HoldItem.ts`, the only such caller).

- [ ] **Step 1: Write the failing tests** — `apps/api/src/domain/value-objects/SessionHash.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { SessionHash } from './SessionHash.js';
import { DomainValidationError } from '../errors.js';

const VALID_HASH = 'a'.repeat(64);

describe('SessionHash.from', () => {
  it('accepts a 64-character hex string', () => {
    expect(SessionHash.from(VALID_HASH).value).toBe(VALID_HASH);
  });

  it('accepts uppercase hex characters', () => {
    const upper = 'A'.repeat(64);
    expect(SessionHash.from(upper).value).toBe(upper);
  });

  it('rejects a string shorter than 64 characters', () => {
    expect(() => SessionHash.from('a'.repeat(63))).toThrow(DomainValidationError);
  });

  it('rejects a string longer than 64 characters', () => {
    expect(() => SessionHash.from('a'.repeat(65))).toThrow(DomainValidationError);
  });

  it('rejects non-hex characters', () => {
    expect(() => SessionHash.from('g'.repeat(64))).toThrow(DomainValidationError);
  });

  it('rejects an empty string', () => {
    expect(() => SessionHash.from('')).toThrow(DomainValidationError);
  });
});
```

and `apps/api/src/domain/value-objects/IdempotencyKey.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { IdempotencyKey } from './IdempotencyKey.js';
import { DomainValidationError } from '../errors.js';

describe('IdempotencyKey.from', () => {
  it('accepts a non-empty string', () => {
    expect(IdempotencyKey.from('idem-1').value).toBe('idem-1');
  });

  it('accepts a string at the 200-character bound', () => {
    const key = 'a'.repeat(200);
    expect(IdempotencyKey.from(key).value).toBe(key);
  });

  it('rejects an empty string', () => {
    expect(() => IdempotencyKey.from('')).toThrow(DomainValidationError);
  });

  it('rejects a string over 200 characters', () => {
    expect(() => IdempotencyKey.from('a'.repeat(201))).toThrow(DomainValidationError);
  });
});
```

- [ ] **Step 2: Run and confirm both fail**

Run: `cd apps/api && npx vitest run src/domain/value-objects/SessionHash.test.ts src/domain/value-objects/IdempotencyKey.test.ts`
Expected: FAIL — modules don't exist

- [ ] **Step 3: Implement `SessionHash.ts`**

```ts
import { DomainValidationError } from '../errors.js';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * A hashed guest-session identifier — always a SHA-256 hex digest
 * (HasherSha256's output), never the raw session id itself.
 */
export class SessionHash {
  private readonly _brand = 'SessionHash' as const;

  private constructor(readonly value: string) {}

  static from(value: string): SessionHash {
    if (!SHA256_HEX_PATTERN.test(value)) {
      throw new DomainValidationError('Session hash must be a 64-character hex string');
    }
    return new SessionHash(value);
  }
}
```

- [ ] **Step 4: Implement `IdempotencyKey.ts`**

```ts
import { DomainValidationError } from '../errors.js';

/**
 * The client-generated key (ADR-048) that lets a replayed hold submit
 * return its original result instead of creating a second hold. Opaque and
 * client-chosen (the web client uses crypto.randomUUID()) — bounded only
 * to reject pathological input at the domain boundary, same rationale as
 * Slug.
 */
export class IdempotencyKey {
  private readonly _brand = 'IdempotencyKey' as const;

  private constructor(readonly value: string) {}

  static from(value: string): IdempotencyKey {
    if (value.length === 0) throw new DomainValidationError('Idempotency key must not be empty');
    if (value.length > 200) throw new DomainValidationError('Idempotency key must be at most 200 characters');
    return new IdempotencyKey(value);
  }
}
```

- [ ] **Step 5: Run and confirm both pass**

Run: `cd apps/api && npx vitest run src/domain/value-objects/SessionHash.test.ts src/domain/value-objects/IdempotencyKey.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Wire the VOs into `Hold.ts`** (replace entire file)

```ts
import { DomainValidationError } from '../errors.js';
import { HoldId } from '../value-objects/HoldId.js';
import { HoldSecret } from '../value-objects/HoldSecret.js';
import { IdempotencyKey } from '../value-objects/IdempotencyKey.js';
import { ItemId } from '../value-objects/ItemId.js';
import { SessionHash } from '../value-objects/SessionHash.js';

export class Hold {
  private constructor(
    readonly id: HoldId,
    readonly itemId: ItemId,
    readonly secret: HoldSecret,
    readonly sessionHash: SessionHash,
    readonly idempotencyKey: IdempotencyKey,
    readonly expiresAt: Date,
  ) {}

  static create(props: {
    id: string; itemId: string; secret: string; sessionHash: string;
    idempotencyKey: string; expiresAt: Date; now: Date;
  }): Hold {
    const secret = HoldSecret.from(props.secret);
    const sessionHash = SessionHash.from(props.sessionHash);
    const idempotencyKey = IdempotencyKey.from(props.idempotencyKey);
    if (props.expiresAt.getTime() <= props.now.getTime()) {
      throw new DomainValidationError('Hold expiresAt must be in the future');
    }
    return new Hold(
      HoldId.from(props.id),
      ItemId.from(props.itemId),
      secret,
      sessionHash,
      idempotencyKey,
      props.expiresAt,
    );
  }
}
```

- [ ] **Step 7: Update `Hold.test.ts`** (replace entire file — `sessionHash` in `validProps` must become a real 64-hex-char string, plus new coverage)

```ts
import { describe, expect, it } from 'vitest';
import { Hold } from './Hold.js';
import { DomainValidationError } from '../errors.js';

describe('Hold.create', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const validProps = {
    id: '55555555-5555-4555-8555-555555555555', itemId: '33333333-3333-4333-8333-333333333333',
    secret: 'hold-secret', sessionHash: 'a'.repeat(64),
    idempotencyKey: 'idem-1', expiresAt: new Date('2026-01-04T00:00:00Z'), now,
  };

  it('creates a hold', () => {
    const hold = Hold.create(validProps);
    expect(hold.id.value).toBe(validProps.id);
    expect(hold.expiresAt).toEqual(validProps.expiresAt);
  });

  it('wraps the secret in a value object', () => {
    expect(Hold.create(validProps).secret.value).toBe('hold-secret');
  });

  it('wraps the session hash in a value object', () => {
    expect(Hold.create(validProps).sessionHash.value).toBe(validProps.sessionHash);
  });

  it('wraps the idempotency key in a value object', () => {
    expect(Hold.create(validProps).idempotencyKey.value).toBe('idem-1');
  });

  it('rejects an empty secret', () => {
    expect(() => Hold.create({ ...validProps, secret: '' })).toThrow(DomainValidationError);
  });

  it('rejects a session hash that is not 64 hex characters', () => {
    expect(() => Hold.create({ ...validProps, sessionHash: 'not-a-hash' })).toThrow(DomainValidationError);
  });

  it('rejects an empty idempotency key', () => {
    expect(() => Hold.create({ ...validProps, idempotencyKey: '' })).toThrow(DomainValidationError);
  });

  it('rejects an expiresAt that is not in the future relative to now', () => {
    expect(() => Hold.create({ ...validProps, expiresAt: now })).toThrow(DomainValidationError);
  });

  it('rejects an id that is not a valid UUID', () => {
    expect(() => Hold.create({ ...validProps, id: 'h1' })).toThrow(DomainValidationError);
  });
});
```

- [ ] **Step 8: Run and confirm the domain suite passes**

Run: `cd apps/api && npx vitest run src/domain && npx eslint src/domain`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/domain/value-objects/SessionHash.ts apps/api/src/domain/value-objects/SessionHash.test.ts \
        apps/api/src/domain/value-objects/IdempotencyKey.ts apps/api/src/domain/value-objects/IdempotencyKey.test.ts \
        apps/api/src/domain/entities/Hold.ts apps/api/src/domain/entities/Hold.test.ts
git commit -m "feat(domain): wrap Hold.sessionHash/idempotencyKey in value objects"
```

---

## Task 3: Move item-view composition onto `Item.toView(status)`

> **Superseded — do not implement.** Both `Item.toView()` and
> `Wishlist.toItemView()` were deleted later in the stack, by
> *"fix(api): compose list view in presentation, not through
> Wishlist.toItemView"* on `feat/walking-skeleton/09-presentation` (PR #13).
>
> Shaping the HTTP response is the presentation layer's job, because that is
> where the `listViewResponseSchema` contract is defined and validated. The GET
> route now reads `wishlist.item` directly and builds `{ id, title, status }`
> itself, keeping the same 404-when-absent behaviour this task describes.
>
> The assessment below still holds — `status` is aggregate/projection state
> (`activeHolds` vs. `quantity`) rather than a field `Item` owns. What did not
> hold is the conclusion drawn from it: the answer was not to give `Item` a
> view method taking `status` as a parameter, but to keep view composition out
> of the domain entirely.

**Branch:** `feat/walking-skeleton/03-domain` (PR #7)
**Resolves:** review comment [4001809577](https://github.com/dtbiedrzycki/gubbins/pull/7#discussion_r4001809577) (`Wishlist.ts:91`) — "I think this may be better suited to be on the Item domain object. Please assess this."

Assessment: `status` is aggregate/projection state (`activeHolds` vs. `quantity`), not something `Item` itself owns — so the method can't move wholesale. The resolution is for `Item` to own composing its own fields (`id`, `title`) into a view, taking `status` as a parameter supplied by whoever tracks it (`Wishlist`).

**Files:**
- Modify: `apps/api/src/domain/entities/Item.ts`
- Modify: `apps/api/src/domain/entities/Item.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`

**Interfaces:**
- Produces: `Item.toView(status: 'available' | 'held'): { id: string; title: string; status: 'available' | 'held' }`.
- `Wishlist.toItemView()`'s own signature and return value are **unchanged** — it now delegates to `Item.toView`. No caller of `Wishlist.toItemView()` anywhere in the stack needs to change.

- [ ] **Step 1: Write the failing test** — append to `apps/api/src/domain/entities/Item.test.ts`

```ts
describe('Item.toView', () => {
  it('composes id, title, and the supplied status', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.toView('available')).toEqual({ id: ITEM_ID, title: 'Stroller', status: 'available' });
    expect(item.toView('held')).toEqual({ id: ITEM_ID, title: 'Stroller', status: 'held' });
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cd apps/api && npx vitest run src/domain/entities/Item.test.ts`
Expected: FAIL — `item.toView is not a function`

- [ ] **Step 3: Implement `Item.toView`** — add to `apps/api/src/domain/entities/Item.ts`, after `reconstitute`

```ts
  /**
   * The read shape the presentation layer renders. `status` is supplied by
   * the caller rather than owned by Item itself — it's aggregate/projection
   * state (activeHolds vs. quantity), not one of this entity's own fields.
   */
  toView(status: 'available' | 'held'): { id: string; title: string; status: 'available' | 'held' } {
    return { id: this.id.value, title: this.title, status };
  }
```

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/api && npx vitest run src/domain/entities/Item.test.ts`
Expected: PASS

- [ ] **Step 5: Make `Wishlist.toItemView` delegate** — in `apps/api/src/domain/entities/Wishlist.ts`, replace:

```ts
  /** The read shape the presentation layer renders, without a repository join. */
  toItemView(): { id: string; title: string; status: 'available' | 'held' } | null {
    if (this.itemState === null) return null;
    return { id: this.itemState.item.id.value, title: this.itemState.item.title, status: this.itemState.status };
  }
```

with:

```ts
  /** The read shape the presentation layer renders, without a repository join. */
  toItemView(): { id: string; title: string; status: 'available' | 'held' } | null {
    if (this.itemState === null) return null;
    return this.itemState.item.toView(this.itemState.status);
  }
```

- [ ] **Step 6: Run the full domain suite**

Run: `cd apps/api && npx vitest run src/domain && npx eslint src/domain`
Expected: PASS — `Wishlist.test.ts`'s existing `describe('Wishlist.toItemView', ...)` block asserts the same return shape and must still pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domain/entities/Item.ts apps/api/src/domain/entities/Item.test.ts apps/api/src/domain/entities/Wishlist.ts
git commit -m "refactor(domain): move item-view composition onto Item.toView(status)"
```

---

## Task 4: `Wishlist.addItem` mints its own item id

**Branch:** `feat/walking-skeleton/03-domain` (PR #7)
**Resolves:** review comment [4001802816](https://github.com/dtbiedrzycki/gubbins/pull/7#discussion_r4001802816) (`Wishlist.ts:77`) — "Since this is a new item, the id should not need to be a parameter of addItem; this method should provide the id."

Resolution (confirmed with the user): `addItem` takes a structurally-typed id-generator capability, following the existing `HoldSecret.matches(candidate, comparer)` precedent for giving the domain layer access to an application-layer capability without importing it (ADR-012). `TokenGenerator` (`apps/api/src/application/ports/TokenGenerator.ts`) already structurally satisfies `{ generateId(): string }`, so `CreateList.ts` (Task 8) passes `this.tokenGenerator` straight through with no port changes. Scope is deliberately limited to `addItem` — `Wishlist.create`/`Hold.create` are unchanged (confirmed with the user).

**Files:**
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.test.ts`

**Interfaces:**
- Produces: `Wishlist.addItem(props: { title: string }, ids: { generateId(): string }): Item` (previously `addItem(props: { id: string; title: string }): Item`). **Breaking change** for every direct caller — see Task 7 (`builders.ts`), Task 8 (`CreateList.ts`), Task 10 (`persistence.integration.test.ts`).

- [ ] **Step 1: Update the failing tests** — in `apps/api/src/domain/entities/Wishlist.test.ts`, replace the `describe('Wishlist.addItem', ...)` block:

```ts
describe('Wishlist.addItem', () => {
  it('attaches the item, which is then reachable through the aggregate', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(wishlist.item).toBe(item);
  });

  it('assigns the wishlist\'s own id to the created item', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(item.wishlistId.value).toBe(WISHLIST_ID);
  });

  it('mints the item id via the supplied generator, not the caller', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(item.id.value).toBe(ITEM_ID);
  });

  it('throws when a second item is added', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(() => wishlist.addItem({ title: 'Pram' }, { generateId: () => '44444444-4444-4444-8444-444444444444' }))
      .toThrow(DomainValidationError);
  });
});
```

and in the `describe('Wishlist.toItemView', ...)` block, replace the one `addItem` call:

```ts
  it('reports an added item as available', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(wishlist.toItemView()).toEqual({ id: ITEM_ID, title: 'Cot', status: 'available' });
  });
```

- [ ] **Step 2: Run and confirm they fail**

Run: `cd apps/api && npx vitest run src/domain/entities/Wishlist.test.ts`
Expected: FAIL — `addItem` still expects `{ id, title }` as its only argument, so `props.title` is `undefined` and/or the second argument is ignored, producing assertion failures (not a compile error, since `{ title, generateId }`... actually it's a two-argument call against a one-argument method — this still compiles under `strict` because excess arguments to a function with fewer parameters are allowed in JS/TS call sites when the extra args are simply unused; the test fails on the resulting empty-title `DomainValidationError` instead).

- [ ] **Step 3: Implement** — in `apps/api/src/domain/entities/Wishlist.ts`, replace:

```ts
  /**
   * Creates and attaches this wishlist's item, assigning it this wishlist's
   * own id — the caller supplies only the id/title a new item needs.
   */
  addItem(props: { id: string; title: string }): Item {
    if (this.itemState !== null) {
      throw new DomainValidationError('Wishlist already has an item; this slice supports a single item per wishlist');
    }
    const item = Item.createSingle({ id: props.id, wishlistId: this.id.value, title: props.title });
    this.itemState = { item, seq: 0, activeHolds: 0, status: 'available' };
    return item;
  }
```

with:

```ts
  /**
   * Creates and attaches this wishlist's item, minting the item's id itself
   * via the supplied generator and assigning its own id as the item's
   * wishlistId — the caller supplies only the title a new item needs.
   * `ids` is taken as a structural type, not an imported interface:
   * domain/ may not import application/ (ADR-012); the application layer's
   * TokenGenerator already satisfies this shape.
   */
  addItem(props: { title: string }, ids: { generateId(): string }): Item {
    if (this.itemState !== null) {
      throw new DomainValidationError('Wishlist already has an item; this slice supports a single item per wishlist');
    }
    const item = Item.createSingle({ id: ids.generateId(), wishlistId: this.id.value, title: props.title });
    this.itemState = { item, seq: 0, activeHolds: 0, status: 'available' };
    return item;
  }
```

- [ ] **Step 4: Run and confirm the file passes**

Run: `cd apps/api && npx vitest run src/domain/entities/Wishlist.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full domain suite**

Run: `cd apps/api && npx vitest run src/domain && npx eslint src/domain`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/entities/Wishlist.ts apps/api/src/domain/entities/Wishlist.test.ts
git commit -m "feat(domain): Wishlist.addItem mints its own item id via an injected generator"
```

---

## Task 5: `Wishlist.getItem` + `authorizeHold(item: Item)`

**Branch:** `feat/walking-skeleton/03-domain` (PR #7)
**Resolves:** review comment [4001817109](https://github.com/dtbiedrzycki/gubbins/pull/7#discussion_r4001817109) (`Wishlist.ts:100`) — "I think this method should require an Item object, so that we know item being attempted to be held is a valid Item that is a part of this wishlist."

Resolution (confirmed with the user): the caller must resolve the `Item` from the `Wishlist` first, then hold it. `Wishlist.getItem(itemId)` is the one place the existence/ownership lookup lives — it also replaces the equivalent inline check currently duplicated in `HoldItem.ts` (Task 9).

**Files:**
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.test.ts`

**Interfaces:**
- Produces: `Wishlist.getItem(itemId: string): Item` (new — throws `ItemNotFoundError` if no item is attached or the id doesn't match).
- Produces: `Wishlist.authorizeHold(item: Item): { expectedSeq: number }` (previously `authorizeHold(itemId: string)`). **Breaking change** for the one caller — see Task 9 (`HoldItem.ts`) and Task 7 (`InMemoryRepositories.test.ts`, which calls it directly).

- [ ] **Step 1: Update the failing tests** — in `apps/api/src/domain/entities/Wishlist.test.ts`:

Replace the `'restores the loaded item state'` test in `describe('Wishlist.reconstitute', ...)`:

```ts
  it('restores the loaded item state', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
    const wishlist = Wishlist.reconstitute({
      ...persisted,
      itemState: { item, seq: 7, activeHolds: 0, status: 'available' },
    });
    expect(wishlist.item).toBe(item);
    expect(wishlist.authorizeHold(item)).toEqual({ expectedSeq: 7 });
  });
```

Replace the entire `describe('Wishlist.authorizeHold', ...)` block, and add a new `describe('Wishlist.getItem', ...)` block after it:

```ts
describe('Wishlist.authorizeHold', () => {
  const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
  const withState = (itemState: WishlistItemState) =>
    Wishlist.reconstitute({ ...validProps, keyGen: 1, itemState });

  it('returns the expected seq when the item is available', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(wishlist.authorizeHold(item)).toEqual({ expectedSeq: 4 });
  });

  it('throws ItemNotFoundError when no item is attached', () => {
    const wishlist = Wishlist.create(validProps);
    expect(() => wishlist.authorizeHold(item)).toThrow(ItemNotFoundError);
  });

  it('throws ItemNotFoundError when the given item does not match the attached item', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    const otherItem = Item.reconstitute({ id: '44444444-4444-4444-8444-444444444444', wishlistId: WISHLIST_ID, title: 'Pram' });
    expect(() => wishlist.authorizeHold(otherItem)).toThrow(ItemNotFoundError);
  });

  it('throws ItemAlreadyHeldError when active holds have reached the item quantity', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: item.quantity, status: 'held' });
    expect(() => wishlist.authorizeHold(item)).toThrow(ItemAlreadyHeldError);
  });
});

describe('Wishlist.getItem', () => {
  const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
  const withState = (itemState: WishlistItemState) =>
    Wishlist.reconstitute({ ...validProps, keyGen: 1, itemState });

  it('returns the attached item when the id matches', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(wishlist.getItem(ITEM_ID)).toBe(item);
  });

  it('throws ItemNotFoundError when no item is attached', () => {
    const wishlist = Wishlist.create(validProps);
    expect(() => wishlist.getItem(ITEM_ID)).toThrow(ItemNotFoundError);
  });

  it('throws ItemNotFoundError when the id does not match the attached item', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(() => wishlist.getItem('44444444-4444-4444-8444-444444444444')).toThrow(ItemNotFoundError);
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `cd apps/api && npx vitest run src/domain/entities/Wishlist.test.ts`
Expected: FAIL — `wishlist.getItem is not a function`; `authorizeHold` calls with an `Item` argument fail the `state.item.id.value !== itemId` comparison (`itemId` would be `undefined` since the old signature reads the first arg as a string).

- [ ] **Step 3: Implement** — in `apps/api/src/domain/entities/Wishlist.ts`, replace:

```ts
  /**
   * Decides whether a hold may be placed on `itemId`, purely from already-loaded
   * state — no I/O. Returns the seq the caller must use for its optimistic write.
   */
  authorizeHold(itemId: string): { expectedSeq: number } {
    const state = this.itemState;
    if (state === null || state.item.id.value !== itemId) throw new ItemNotFoundError(itemId);
    if (state.activeHolds >= state.item.quantity) throw new ItemAlreadyHeldError(itemId);
    return { expectedSeq: state.seq };
  }
```

with:

```ts
  /**
   * Resolves `itemId` to the Item this wishlist owns, or throws
   * ItemNotFoundError. This is the only way to obtain an Item to pass to
   * authorizeHold — establishing it as genuinely this wishlist's item
   * before any hold decision is made.
   */
  getItem(itemId: string): Item {
    if (this.itemState === null || this.itemState.item.id.value !== itemId) {
      throw new ItemNotFoundError(itemId);
    }
    return this.itemState.item;
  }

  /**
   * Decides whether a hold may be placed on `item`, purely from already-loaded
   * state — no I/O. Returns the seq the caller must use for its optimistic write.
   */
  authorizeHold(item: Item): { expectedSeq: number } {
    const state = this.itemState;
    if (state === null || state.item.id.value !== item.id.value) throw new ItemNotFoundError(item.id.value);
    if (state.activeHolds >= item.quantity) throw new ItemAlreadyHeldError(item.id.value);
    return { expectedSeq: state.seq };
  }
```

- [ ] **Step 4: Run and confirm the file passes**

Run: `cd apps/api && npx vitest run src/domain/entities/Wishlist.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full domain suite and the PR's own test plan**

Run: `cd apps/api && npx vitest run src/domain && npx eslint src/domain`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/entities/Wishlist.ts apps/api/src/domain/entities/Wishlist.test.ts
git commit -m "feat(domain): Wishlist.getItem resolves an Item; authorizeHold now requires one"
```

---

## Task 6: Push PR #7, reply to the five review threads, update the PR description

**Branch:** `feat/walking-skeleton/03-domain` (PR #7)

**Files:** none (GitHub only)

- [ ] **Step 1: Push the branch**

```bash
git push origin feat/walking-skeleton/03-domain
```

- [ ] **Step 2: Reply to each review thread** (reply *in* the thread, not as a new top-level comment — `gh api .../comments/{id}/replies`)

```bash
gh api repos/dtbiedrzycki/gubbins/pulls/7/comments/4001802816/replies -f body="Changed \`addItem\` to take an injected id-generator capability instead of a caller-supplied id: \`addItem(props: { title: string }, ids: { generateId(): string })\`. \`ids\` is a structural type, not an imported interface — same pattern as \`HoldSecret.matches\`'s \`comparer\` param, since domain/ can't import application/ (ADR-012). \`TokenGenerator\` already satisfies this shape, so \`CreateList.ts\` passes it straight through with no port changes. The wishlist now decides *when* to mint the id, which is what this comment was after."

gh api repos/dtbiedrzycki/gubbins/pulls/7/comments/4001809577/replies -f body="Assessed: status is aggregate/projection state (activeHolds vs. quantity), not something Item owns, so toItemView couldn't move wholesale. Instead, Item now owns composing its own fields into a view: \`Item.toView(status)\` takes status as a parameter, and \`Wishlist.toItemView()\` delegates to it. Wishlist.toItemView()'s own signature is unchanged."

gh api repos/dtbiedrzycki/gubbins/pulls/7/comments/4001817109/replies -f body="Added \`Wishlist.getItem(itemId): Item\`, which does the existence/ownership lookup and throws ItemNotFoundError; \`authorizeHold\` now takes the resolved Item instead of a raw itemId. The only caller (HoldItem.ts) now does \`const item = wishlist.getItem(input.itemId)\` before \`wishlist.authorizeHold(item)\`, which also removes a duplicate inline check that used to live in HoldItem.ts itself."

gh api repos/dtbiedrzycki/gubbins/pulls/7/comments/4001825239/replies -f body="Added SessionHash (validates a 64-character hex string, matching HasherSha256's output) and IdempotencyKey (non-empty, bounded to 200 characters per ADR-048's client-generated key) value objects, wired into Hold the same way HoldSecret already is."
```

- [ ] **Step 3: Comment on the issue-level thread** (issue comments have no reply mechanism — post a new comment referencing it)

```bash
gh pr comment 7 --body "Re consolidating the id value objects: added a \`createUuidId(brand)\` factory (\`domain/value-objects/UuidId.ts\`) — WishlistId/ItemId/HoldId are now one-line re-exports of it (\`export const X = createUuidId('X'); export type X = ReturnType<typeof X.from>;\`), so the public API (\`X.from(...)\`, \`: X\` as a type) is unchanged everywhere else. Slug stays separate since its validation is genuinely different."
```

- [ ] **Step 4: Update the PR description's Review section** — append to the existing `## Review` section via `gh pr edit 7 --body-file`:

Read the current body with `gh pr view 7 --json body --jq .body`, append the following paragraph before the closing "🤖 Generated with" footer, and write it back with `gh pr edit 7 --body-file <tmpfile>`:

```markdown
**Second review-round fixes:** consolidated WishlistId/ItemId/HoldId into a shared `createUuidId` factory; added `SessionHash`/`IdempotencyKey` value objects on `Hold`; moved item-view composition onto `Item.toView(status)`; `Wishlist.addItem` now mints its own item id via an injected generator instead of taking one from the caller; `Wishlist.authorizeHold` now takes a resolved `Item` (via the new `Wishlist.getItem`) instead of a raw id string. These last two change `Wishlist`'s public API and ripple via rebase into #8 (test builder), #9 (`CreateList`), #10 (`HoldItem`), and #11 (an integration test) — no other branch in the stack touches those call sites.
```

---

## Task 7: Rebase `04-ports` (PR #8) — fix the test builder and `authorizeHold` call sites

**Branch:** `feat/walking-skeleton/04-ports` (PR #8), rebasing onto the new tip of `feat/walking-skeleton/03-domain`

**Files:**
- Modify: `apps/api/src/application/test-fakes/builders.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.test.ts`

- [ ] **Step 1: Rebase**

```bash
git checkout feat/walking-skeleton/04-ports
git rebase feat/walking-skeleton/03-domain
```

Expected: no textual conflicts (03-domain's changes don't touch any file 04-ports' own commit modifies), but the rebased tree now fails to compile/test because `builders.ts` calls the old `addItem` signature and `InMemoryRepositories.test.ts` calls the old `authorizeHold` signature.

- [ ] **Step 2: Confirm the break**

Run: `cd apps/api && npx vitest run src/application/test-fakes`
Expected: FAIL — TS error or runtime failure from the signature mismatches below.

- [ ] **Step 3: Fix `builders.ts`** — in the `WishlistBuilder.build()` method, replace:

```ts
  build(): Wishlist {
    const wishlist = Wishlist.create({ ...this.props });
    if (this.itemProps !== null) wishlist.addItem(this.itemProps);
    return wishlist;
  }
```

with:

```ts
  build(): Wishlist {
    const wishlist = Wishlist.create({ ...this.props });
    if (this.itemProps !== null) {
      const { id, title } = this.itemProps;
      wishlist.addItem({ title }, { generateId: () => id });
    }
    return wishlist;
  }
```

`withItem(props: { id: string; title: string })`'s own signature is unchanged — tests calling `.withItem({ id, title })` (in `builders.test.ts`, `InMemoryRepositories.test.ts`, and downstream) don't need to change.

- [ ] **Step 4: Fix `InMemoryRepositories.test.ts`** — replace the two direct `authorizeHold` calls in the `'marks the item held...'` test:

```ts
  it('marks the item held, so the reloaded aggregate refuses a second hold', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    const beforeHold = await repo.findById(WISHLIST_ID);
    expect(beforeHold?.authorizeHold(beforeHold.getItem(ITEM_ID))).toEqual({ expectedSeq: 0 });

    await repo.markItemHeld(WISHLIST_ID, ITEM_ID, 1);

    const afterHold = await repo.findById(WISHLIST_ID);
    expect(afterHold?.toItemView()?.status).toBe('held');
    expect(() => afterHold?.authorizeHold(afterHold.getItem(ITEM_ID))).toThrow(ItemAlreadyHeldError);
  });
```

(`beforeHold?.authorizeHold(beforeHold.getItem(ITEM_ID))` — the second `beforeHold` has no `?.` deliberately: if `beforeHold` were unexpectedly null, this throws immediately instead of silently comparing `undefined` to the expectation, which is the more informative failure.)

- [ ] **Step 5: Run and confirm the layer passes**

Run: `cd apps/api && npx vitest run src/application && npx eslint src/application`
Expected: PASS

- [ ] **Step 6: Commit the fixup and force-push**

```bash
git add apps/api/src/application/test-fakes/builders.ts apps/api/src/application/test-fakes/InMemoryRepositories.test.ts
git commit -m "fix(application): adapt to Wishlist.addItem/authorizeHold API changes from PR #7"
git push --force-with-lease origin feat/walking-skeleton/04-ports
```

**Confirm with the user before this force-push** — it rewrites an already-open PR (#8).

---

## Task 8: Rebase `05-create-and-key` (PR #9) — fix `CreateList.ts`

**Branch:** `feat/walking-skeleton/05-create-and-key` (PR #9), rebasing onto the new tip of `feat/walking-skeleton/04-ports`

**Files:**
- Modify: `apps/api/src/application/use-cases/CreateList.ts`

- [ ] **Step 1: Rebase**

```bash
git checkout feat/walking-skeleton/05-create-and-key
git rebase feat/walking-skeleton/04-ports
```

- [ ] **Step 2: Confirm the break**

Run: `cd apps/api && npx vitest run src/application/use-cases/CreateList.test.ts`
Expected: FAIL — `addItem` called with the old `{ id, title }` shape.

- [ ] **Step 3: Fix** — in `CreateList.execute`, replace:

```ts
      // Wishlist assigns its own id to the item it creates.
      const item = wishlist.addItem({
        id: this.tokenGenerator.generateId(),
        title: input.itemTitle,
      });
```

with:

```ts
      // Wishlist mints its own item id via the generator it's handed.
      const item = wishlist.addItem({ title: input.itemTitle }, this.tokenGenerator);
```

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/api && npx vitest run src/application/use-cases/CreateList.test.ts`
Expected: PASS — `SequentialTokenGenerator`'s counter output is unchanged: `Wishlist.create` still consumes counters 1–4 (id/slug/ownerToken/key), and `addItem` still calls `generateId()` exactly once immediately after, consuming counter 5, same as before.

- [ ] **Step 5: Run the full layer**

Run: `cd apps/api && npx vitest run src/application && npx eslint src/application`
Expected: PASS

- [ ] **Step 6: Commit and force-push**

```bash
git add apps/api/src/application/use-cases/CreateList.ts
git commit -m "fix(application): pass tokenGenerator directly to Wishlist.addItem"
git push --force-with-lease origin feat/walking-skeleton/05-create-and-key
```

**Confirm with the user before this force-push** (PR #9).

---

## Task 9: Rebase `06-hold-item` (PR #10) — fix `HoldItem.ts`

**Branch:** `feat/walking-skeleton/06-hold-item` (PR #10), rebasing onto the new tip of `feat/walking-skeleton/05-create-and-key`

**Files:**
- Modify: `apps/api/src/application/use-cases/HoldItem.ts`

**Interfaces:**
- Consumes: `Wishlist.getItem(itemId): Item`, `Wishlist.authorizeHold(item: Item)`, `Hold.sessionHash: SessionHash`, `Hold.idempotencyKey: IdempotencyKey` (all from this plan's earlier tasks).

- [ ] **Step 1: Rebase**

```bash
git checkout feat/walking-skeleton/06-hold-item
git rebase feat/walking-skeleton/05-create-and-key
```

- [ ] **Step 2: Confirm the break**

Run: `cd apps/api && npx vitest run src/application/use-cases/HoldItem.test.ts`
Expected: FAIL — `wishlist.authorizeHold(input.itemId)` now expects an `Item`, not a string; `hold.sessionHash`/`hold.idempotencyKey` are now VOs, not strings, so `recordHold`'s plain-string port parameters get an object where a string is expected.

- [ ] **Step 3: Fix** — in `HoldItem.execute`, replace:

```ts
      // An unknown wishlist and an item that isn't in it are the same failure
      // from this use case's contract: there is no such item to hold.
      const wishlist = await ctx.wishlists.findById(input.wishlistId);
      if (!wishlist || wishlist.item?.id.value !== input.itemId) throw new ItemNotFoundError(input.itemId);
```

with:

```ts
      // An unknown wishlist and an item that isn't in it are the same failure
      // from this use case's contract: there is no such item to hold.
      // getItem is the one place that check now lives, replacing the
      // wishlist.item?.id.value !== input.itemId comparison that used to be
      // duplicated here and inside authorizeHold.
      const wishlist = await ctx.wishlists.findById(input.wishlistId);
      if (!wishlist) throw new ItemNotFoundError(input.itemId);
      const item = wishlist.getItem(input.itemId);
```

then replace:

```ts
      const { expectedSeq } = wishlist.authorizeHold(input.itemId);
```

with:

```ts
      const { expectedSeq } = wishlist.authorizeHold(item);
```

then replace the two occurrences of `hold.sessionHash`/`hold.idempotencyKey` (once in the `ItemHeldEvent` literal, once in the `recordHold` call) to append `.value`:

```ts
      const event: ItemHeldEvent = {
        type: 'ItemHeld',
        itemId: hold.itemId.value,
        holdId: hold.id.value,
        secret: hold.secret.value,
        sessionHash: hold.sessionHash.value,
        idempotencyKey: hold.idempotencyKey.value,
        expiresAt: hold.expiresAt.toISOString(),
        occurredAt: now.toISOString(),
      };
```

```ts
      await ctx.holds.recordHold({
        id: hold.id.value, itemId: hold.itemId.value, secret: hold.secret.value,
        sessionHash: hold.sessionHash.value, idempotencyKey: hold.idempotencyKey.value, expiresAt: hold.expiresAt,
      });
```

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/api && npx vitest run src/application/use-cases/HoldItem.test.ts`
Expected: PASS — `HoldItem.test.ts` uses real `Wishlist`/`InMemoryWishlistRepository` instances throughout (no mocks), so `getItem` works without any test changes; `recorded?.sessionHash` in that test reads the *repository's* persisted plain-string row (`InMemoryHoldRepository`'s own storage shape), not the domain `Hold.sessionHash` VO, so it's unaffected by this task.

- [ ] **Step 5: Run the full layer**

Run: `cd apps/api && npx vitest run src/application && npx eslint src/application`
Expected: PASS

- [ ] **Step 6: Commit and force-push**

```bash
git add apps/api/src/application/use-cases/HoldItem.ts
git commit -m "fix(application): adapt HoldItem to Wishlist.getItem/authorizeHold and Hold VO changes"
git push --force-with-lease origin feat/walking-skeleton/06-hold-item
```

**Confirm with the user before this force-push** (PR #10).

---

## Task 10: Rebase `07-persistence` (PR #11) — fix the integration test's direct `addItem` calls

**Branch:** `feat/walking-skeleton/07-persistence` (PR #11), rebasing onto the new tip of `feat/walking-skeleton/06-hold-item`

**Files:**
- Modify: `apps/api/src/infrastructure/persistence.integration.test.ts`

- [ ] **Step 1: Rebase**

```bash
git checkout feat/walking-skeleton/07-persistence
git rebase feat/walking-skeleton/06-hold-item
```

- [ ] **Step 2: Confirm the break**

Run: `cd apps/api && npx vitest run src/infrastructure/persistence.integration.test.ts`
Expected: FAIL — five direct `wishlist.addItem({ id: X, title: Y })` calls against the old signature.

- [ ] **Step 3: Fix all five call sites.** In `describe('WishlistRepositoryKysely', ...)`:

```ts
  it('round-trips a wishlist together with its attached item', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    wishlist.addItem({ title: 'Stroller' }, { generateId: () => I1 });

    await repo.insert(wishlist);
    const found = await repo.findBySlug('abc123');

    expect(found?.toItemView()).toEqual({ id: I1, title: 'Stroller', status: 'available' });
    expect(found?.item?.id.value).toBe(I1);
  });

  it('findById loads the full aggregate, item included', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    wishlist.addItem({ title: 'Stroller' }, { generateId: () => I1 });
    await repo.insert(wishlist);

    const found = await repo.findById(W1);

    expect(found?.toItemView()).toEqual({ id: I1, title: 'Stroller', status: 'available' });
    expect(found?.item?.id.value).toBe(I1);
  });

  it('markItemHeld marks the wishlist item held', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    wishlist.addItem({ title: 'Stroller' }, { generateId: () => I1 });
    await repo.insert(wishlist);

    await repo.markItemHeld(W1, I1, 1);

    const found = await repo.findById(W1);
    expect(found?.toItemView()?.status).toBe('held');
  });

  it('markItemHeld throws ItemNotFoundError for an item in a different wishlist', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const first = Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    first.addItem({ title: 'Stroller' }, { generateId: () => I1 });
    const second = Wishlist.create({ id: W2, slug: 'wishlist-w2', title: 'Wedding', ownerToken: 'owner-tok-2', key: 'guest-key-2' });
    second.addItem({ title: 'Toaster' }, { generateId: () => I2 });
    await repo.insert(first);
    await repo.insert(second);

    await expect(repo.markItemHeld(W2, I1, 1)).rejects.toThrow(ItemNotFoundError);
    expect((await repo.findById(W1))?.toItemView()?.status).toBe('available');
  });
```

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/api && npx vitest run src/infrastructure/persistence.integration.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full layer**

Run: `cd apps/api && npx vitest run src/infrastructure && npx eslint src/infrastructure`
Expected: PASS

- [ ] **Step 6: Commit and force-push**

```bash
git add apps/api/src/infrastructure/persistence.integration.test.ts
git commit -m "fix(infrastructure): adapt integration test to Wishlist.addItem's new signature"
git push --force-with-lease origin feat/walking-skeleton/07-persistence
```

**Confirm with the user before this force-push** (PR #11).

---

## Task 11: Rebase `08-crypto-and-observability` through `16-e2e-and-verification` (PRs #12–#20)

None of these nine branches' own commits touch `Wishlist.ts`, `Item.ts`, `Hold.ts`, `builders.ts`, `CreateList.ts`, `HoldItem.ts`, or `persistence.integration.test.ts` (confirmed by diffing each branch against its immediate parent before writing this plan) — they carry those files forward from `06`/`07` unchanged and consume the layers above them (presentation, web) rather than calling these domain/application methods directly. Expect each rebase to be a clean, no-conflict fast-forward-style replay with all tests passing unmodified. If any branch's own test suite fails after rebasing, stop and treat that as a new finding — it means this plan missed a call site, and the specific file/line needs the same kind of fix as Tasks 7–10 before continuing to the next branch in the stack.

**Files:** none expected.

- [ ] **Step 1: Rebase and verify each branch in order, pushing after each one passes**

```bash
for branch in 08-crypto-and-observability 09-presentation 10-web-scaffold 11-api-client \
              12-create-list-ui 13-guest-key-ui 14-holds-ui 15-wire-it-together 16-e2e-and-verification; do
  git checkout "feat/walking-skeleton/$branch"
  git rebase "feat/walking-skeleton/${prev:-07-persistence}"
  # Run this branch's own layer tests — widen the path for branches that add
  # apps/web or e2e suites (10 onward): check package.json / existing CI
  # config for the exact test command each branch's own PR uses.
  prev="$branch"
done
```

Run the project's existing test command(s) for each branch (per that branch's own PR test plan — check `docs/superpowers/plans/2026-09-12-walking-skeleton.md`'s task list for the exact command each PR specifies, since branches 10+ add `apps/web` and eventually Playwright e2e suites that don't use the `cd apps/api && npx vitest run src/...` form).
Expected: PASS at every branch, with no source changes needed.

- [ ] **Step 2: Push each branch as it passes**

```bash
git push --force-with-lease origin "feat/walking-skeleton/$branch"
```

**Confirm with the user before force-pushing this batch** (PRs #12–#20) — nine open PRs at once is worth a single explicit go-ahead rather than nine separate confirmations, but flag it clearly before starting.

---

## Self-Review

**Spec coverage:** all five unanswered review comments have a task (Tasks 1–5 implement, Task 6 replies); the two API-breaking changes (Tasks 4, 5) have explicit downstream-propagation tasks (7–11) covering every file a prior diff-per-branch check found touching `addItem`/`authorizeHold`/`sessionHash`/`idempotencyKey`.

**Type consistency:** `addItem(props: { title: string }, ids: { generateId(): string })` and `authorizeHold(item: Item)` are used identically across Tasks 4/5 (domain), 7 (builder), 8 (`CreateList`), 9 (`HoldItem`), and 10 (integration test). `Item.toView(status: 'available' | 'held')` matches `WishlistItemState.status`'s existing type everywhere it's read.

**No placeholders:** every step above shows the literal before/after code or the literal shell command; nothing is deferred to "similar to Task N."
