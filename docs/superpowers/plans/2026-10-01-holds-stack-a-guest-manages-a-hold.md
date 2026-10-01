# Holds lifecycle, stack A: "Guest manages a hold" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A keyed-in guest sees their holds in a "Your holds" section and can extend one once, release it, or mark it purchased, while holds expire lazily after a configurable `HOLD_DURATION_DAYS` and every ledger event records who acted.

**Architecture:** Hold state becomes timestamps (`extendedAt`, `releasedAt`, `purchasedAt`, `expiresAt`) read through one derived `Hold.statusAt(now)`. The `Wishlist` aggregate loads only the list's *active* holds and decides availability from them; nothing is ever written when a hold expires. Use cases receive an `AccessContext` built in `presentation/`, ask the domain policy `HoldPermissions` who may act, and pass that role to `EventStore.append` as envelope metadata (ADR-0075). Writes run under `BEGIN IMMEDIATE`. A minimal `rebuildProjections` re-folds `holds` and `item_state` from `event_log`.

**Tech Stack:**
- Backend: Node 24.17, TypeScript 6, Fastify 5, zod 4, `fastify-type-provider-zod` 7, Kysely 0.29 over better-sqlite3 11, vitest 5
- Web: React 19, TanStack Query 5, `openapi-fetch` 0.17, MSW 3, Tailwind 4, Testing Library
- E2E: Playwright 1.63 with `@axe-core/playwright`

**Spec:** `docs/superpowers/specs/2026-09-30-holds-lifecycle-design.md` (approved, merged in PR #28). Read "Reading this spec", the decision log (D1–D20), §1–§3, §5, §6 and the Delivery row for stack A before starting. The roadmap is `docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md`.

## Global Constraints

- **Stack A only (D14, D20).** Introduce only stack A's columns, payload fields, routes and request fields. Amend `0001_init` and event shapes in place; never add a `0002` migration.
- **Not in stack A:**
  - Holds keep the skeleton's server-generated `secret` column, `HoldSecret` and `ItemHeld.secretHash` until stack E. No `publicKey`, `signature` or `/hold-link`.
  - No `pii_ref`, `name`, `email` or `message` until D. No `capabilities.reminders` until G.
  - No owner access and no owner routes until B. No `MAX_ACTIVE_HOLDS_PER_SESSION` until C.
  - Lists stay single-item until B: `Wishlist.addItem` keeps its single-item guard, and `GET /api/lists/:slug` keeps `item`, not `items[]`.
- **Hold state:** `statusAt(now)` is `purchased` if `purchasedAt` is set, else `released` if `releasedAt` is set, else `expired` if `now > expiresAt`, else `active`. It is never stored. At the instant `now === expiresAt` a hold is still **active**.
- **Lifecycle rules:**
  - Extend is allowed once, only while active. It sets `extendedAt = now` and adds `HOLD_DURATION_DAYS` to the **current** `expiresAt`, so the most a hold can last is 2 × duration (ADR-0002).
  - Release is allowed only while active.
  - Mark purchased is allowed while active. An **expired** hold may still be marked purchased if the item has a free unit; otherwise it is a 409 `item_unavailable` (D15). Released and purchased holds are terminal.
- **`HOLD_DURATION_DAYS`:** default `3` (ops). Validated at the composition root into a `HoldPolicy`, and exposed to the web app as `capabilities.holdDurationDays`.
- **Events:**
  - Every payload carries `v: 1` and `occurredAt`.
  - Payloads in stack A:
    - `ItemHeld { holdId, itemId, secretHash, sessionHash, idempotencyKey, expiresAt, occurredAt }`
    - `HoldExtended { holdId, expiresAt, occurredAt }`
    - `HoldReleased { holdId, occurredAt }`
    - `ItemPurchased { holdId, occurredAt }`
  - `actor` is a column on `event_log`, `NOT NULL CHECK (actor IN ('guest','owner'))`, supplied by the use case to `EventStore.append(itemId, expectedSeq, events, actor)`. It is never in a payload and never read from request input (ADR-0075, D6).
- **Errors:**
  - Generic 404 `{ message: 'Not found' }` for an unknown list, a missing or invalid session, an unknown or malformed hold id, another list's hold, or another session's hold.
  - 409 `{ message, code }` with `code` one of `item_unavailable`, `hold_not_active`, `hold_already_extended`. `hold_cap_reached` arrives in C and `idempotency_conflict` in E.
  - A `ConcurrencyError` is retried 3 times with jitter before it becomes a 409 with no `code`.
- **Storage:** `expires_at` and every lifecycle timestamp are written with `Date.prototype.toISOString()`, so SQL string comparison is time order. `UnitOfWork` begins with `BEGIN IMMEDIATE`.
- **Layering:**
  - `domain/` imports nothing from `application/` or `infrastructure/`. Take collaborators as structural types, the existing precedent.
  - Nothing below `presentation/` calls `Date.now()` or `new Date()` to decide behaviour. Use the injected `Clock`. The existing `created_at`/`updated_at` bookkeeping writes in `infrastructure/` are the only exception.
  - `AccessContext` is built only in `presentation/accessContext.ts` and passed to use cases beside, never inside, `TransactionContext`. The raw session id never crosses into `application/`; only its hash does.
- **Copy:** use "hold", never "reserve". The duration line reads "Held for you for N days".
- **ADR-0025:** status changes are announced through `aria-live` regions.
- **Generated contract (ADR-0077):** after any change to a route or schema in `@gubbins/shared-types`, run `npm run gen:api` and commit both `apps/api/openapi.json` and `apps/web/src/api/schema.gen.ts`. The freshness tests fail otherwise.
- **Green bar per PR:** `npm run lint && npm test && npm run build` and `npm run test:e2e` pass on every branch.
- **Local sandbox quirks:**
  - In this dev container the first test of each web vitest file can exceed the 5 s default on a cold start. Run web tests locally as `npx vitest run --testTimeout=30000` from `apps/web`. CI is unaffected.
  - `bats` test 15 (`verify-signatures.bats`, "PGP anchor carries no key") can deadlock in gpg here. That is a pre-existing race in `scripts/verify-signatures.sh`, unrelated to this stack. If `npm test` stalls there, kill the stuck `gpg --fingerprint` process and the suite continues.
- **Commits:**
  - Every commit is signed (`git log --format='%h %G? %s'` shows `G`).
  - Use conventional prefixes (`feat(api):`, `feat(web):`, `test(api):`, `docs:`).
  - End every message with:
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn
    ```
- **PRs:**
  - Each branch is cut from the previous one and its PR targets that branch.
  - Every PR description says: "Dev databases must be recreated after this merges (0001_init amended in place, D14)."
  - PR bodies end with:
    ```
    🤖 Generated with [Claude Code](https://claude.com/claude-code)

    https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn
    ```
- **History rewrites:** auto mode cannot force-push. When a stacked branch must be rebased, hand the user the exact `! git push --force-with-lease=<branch>:<old-sha> origin <branch>` line.

## Review Focus

1. **A database created by an older build.** `createTable(...).ifNotExists()` silently skips changed tables, so the first hold would otherwise fail with a 500. The server must refuse to start, naming the table and telling the operator to recreate the database. Pinned in Task 2.3.
2. **An action on a hold whose state changed since the page loaded.** If the hold expired meanwhile, or was released in another tab, the guest should see a readable message (`This hold is no longer active.`) in a `role="alert"`, and the card should refresh to the real state. Pinned in Task 8.3.
3. **A double tap on Extend, Release or Mark as purchased over slow venue wifi.** All of that hold's action buttons are disabled while one of its actions is pending, so only one request goes out. Pinned in Task 8.3.
4. **A malformed `HOLD_DURATION_DAYS`** (`0`, `-1`, `1.5`, `3d`, `abc`, `' 2'`). Startup should fail with a message naming the variable. Unset or empty falls back to `3`. Pinned in Task 6.2.
5. **A hold-action URL with a malformed or foreign `holdId`** (`not-a-uuid`, another list's hold, another session's hold). The response should be the generic 404, never a 500. Nothing on that path may call `UuidId.from` on request input. Pinned in Task 6.3.

## Decisions this plan makes (beyond the spec)

These refine the spec where it is silent. Each is cheap to reverse before the PR that introduces it merges.

1. **Eight PRs instead of the spec's five.** Persistence is split in two: the `BEGIN IMMEDIATE`/concurrency work and the aggregate change stay in PR 4, and `rebuildProjections` moves after the use cases (PR 7), so its re-fold test drives the real write path. "Use cases, routes, web, e2e" becomes three PRs (application, API, web + e2e).
2. **`HoldRepository.findForSession(wishlistId, sessionHash)`** is added beside the spec's port list. "Your holds" must show the session's expired holds (D15 lets them be purchased), and D8 keeps those out of the aggregate's snapshot.
3. **`WishlistRepository.findBySlug/findById` take `now`**, because the aggregate's active-hold snapshot is defined only at an instant. `EnterGuestKey` gains a `Clock`.
4. **The view's `actions: { extend, release, purchase }` are computed by the domain** (`Hold.canExtendAt`, `Hold.canReleaseAt`, `Wishlist.canPurchaseHold`). The web app shows exactly those buttons and never re-derives a rule.
5. **Retry lives in a `RetryingUnitOfWork` decorator** (application layer), so every use case gets the 3× retry with jitter and none repeats it.
6. **Until stack E, `rebuildProjections` carries each hold's `secret` over from the row it replaces.** The ledger has only its hash. A hold with no row to carry from fails the whole rebuild and rolls it back, rather than inventing a credential.
7. **A hold replay keeps answering 201**, returning the current view of the original hold. The spec's "200 on replay" arrives with stack E's public-key comparison.
8. **`HOLD_DURATION_DAYS` must be a whole number ≥ 1**, with no upper cap, which the spec does not set. Unset or empty means 3.
9. **Release is confirmed inline** ("Release your hold on Stroller?" with **Yes, release it** / **Keep my hold**) rather than in a second `<dialog>`.
10. **The hold dialog keeps its CTA "Yes, hold it".** The `HoldSheet` rename, "Confirm hold" and the name/message fields arrive with stack D. Stack A only adds the "Held for you for N days." line and the open-time key.

## File map

Backend (`apps/api/src`):

| File | Change | Responsibility |
|---|---|---|
| `domain/Actor.ts` | create (PR 2) | `type Actor = 'guest' \| 'owner'` |
| `domain/events/LedgerEvent.ts` | create (PR 2), extend (PR 3) | union of every stream event |
| `domain/events/ItemHeldEvent.ts` | modify (PR 2) | add `v: 1` |
| `domain/events/HoldExtendedEvent.ts`, `HoldReleasedEvent.ts`, `ItemPurchasedEvent.ts` | create (PR 3) | lifecycle payloads |
| `domain/errors.ts` | modify (PR 3) | `ItemUnavailableError` (renamed), `HoldNotFoundError`, `HoldNotActiveError`, `HoldAlreadyExtendedError` |
| `domain/entities/Hold.ts` | modify (PR 3) | timestamps, `reconstitute`, `statusAt`, `extend`, `release`, `markPurchased`, predicates |
| `domain/policies/HoldPermissions.ts` | create (PR 3) | guest rows of the permission table |
| `domain/entities/Item.ts` | modify (PR 4) | `purchasedCount` replaces `activeHolds`; availability from a passed-in active count; `recordEvent`, `recordPurchase` |
| `domain/entities/Wishlist.ts` | modify (PR 4) | active-hold snapshot; `holdItem`, `extendHold`, `releaseHold`, `purchaseHold`, `findHold`, `owns`, `canPurchaseHold`, `itemStatusAt` |
| `application/ports/EventStore.ts` | modify (PR 2) | `append(itemId, expectedSeq, events, actor)` |
| `application/ports/HoldRepository.ts` | modify (PR 4) | speaks `Hold`; `insert`, `save`, `findById`, `findByIdempotencyKey`, `findActiveForWishlist`, `findForSession` |
| `application/ports/WishlistRepository.ts` | modify (PR 4) | `findBySlug(slug, now)`, `findById(id, now)`, `saveItemState(item)` |
| `application/ports/ItemRepository.ts` | modify (PR 4) | internal collaborator: `saveState` replaces `markHeld` |
| `application/ports/contracts/*.contract.ts` | create (PR 4) | port contract suites (D9) |
| `application/test-fakes/InMemoryRepositories.ts` | rewrite (PR 4) | shared `InMemoryStore`, `inMemoryPersistence()` |
| `application/AccessContext.ts`, `HoldPolicy.ts`, `RetryingUnitOfWork.ts`, `views/HoldView.ts` | create (PR 5) | request credentials, hold config, conflict retry, view mapping |
| `application/use-cases/holdCommand.ts` | create (PR 5) | `HoldCommand` shape, `findOwnedHold` |
| `application/use-cases/ExtendHold.ts`, `ReleaseHold.ts`, `MarkHoldPurchased.ts`, `GetListView.ts` | create (PR 5) | use cases |
| `application/use-cases/HoldItem.ts` | modify (PRs 2, 4, 5) | actor, aggregate API, `AccessContext`, `HoldView` |
| `application/use-cases/EnterGuestKey.ts` | modify (PR 4) | `Clock` for the aggregate load |
| `application/test-fakes/scenarios.ts` | create (PR 5) | shared seed for hold-command tests |
| `infrastructure/db/migrations/0001_init.ts`, `db/schema.ts` | modify (PRs 2, 4) | stack A columns, checks, indexes |
| `infrastructure/db/assertSchemaMatches.ts` | create (PR 2) | refuse a stale database at startup |
| `infrastructure/db/immediateTransaction.ts` | create (PR 4) | `BEGIN IMMEDIATE` helper |
| `infrastructure/db/createDb.ts` | modify (PR 4) | busy-timeout option |
| `infrastructure/*Kysely.ts` | modify (PRs 2, 4) | adapters for the new ports |
| `infrastructure/projections/rebuildProjections.ts` | create (PR 7) | D18 re-fold + CLI |
| `presentation/accessContext.ts` | create (PR 5) | cookie → `AccessContext` |
| `presentation/domainErrorResponse.ts` | create (PR 6) | domain error → status + body |
| `presentation/holdPolicyConfig.ts` | create (PR 6) | `HOLD_DURATION_DAYS` parsing |
| `presentation/routes.ts`, `compositionRoot.ts`, `server.ts`, `openApiDocument.ts` | modify (PRs 4–6) | routes and wiring |

Shared types (`packages/shared-types/src`): `holdView.ts` (create, PR 6); `listView.ts`, `holdItem.ts`, `errorResponse.ts`, `index.ts` (modify, PRs 4/6).

Web (`apps/web/src`): `api/client.ts` (PR 8), `features/holds/useHoldCredential.ts`, `HoldDialog.tsx`, `ItemView.tsx`, `useHoldAction.ts`, `HoldActions.tsx`, `YourHolds.tsx`, `formatExpiry.ts`, `pages/ListPage.tsx` (PR 8), generated `api/schema.gen.ts` (PRs 4, 6).

E2E: `e2e/guest-manages-a-hold.spec.ts` (create), `e2e/walking-skeleton.spec.ts` (modify), both PR 8.

## PR map

| PR | Branch (`feat/holds-a/…`) | Tasks | Title |
|---|---|---|---|
| 1 | `01-docs` | 1.1 | docs: holds stack A plan, Wishlist aggregate-root ADR, ADR-0075 accepted |
| 2 | `02-schema-envelope` | 2.1–2.3 | feat(api): stack A schema amendment and the event envelope (actor, v) |
| 3 | `03-domain-lifecycle` | 3.1–3.4 | feat(api): hold lifecycle in the domain (statusAt, timestamps, guest permissions) |
| 4 | `04-persistence` | 4.1–4.4 | feat(api): aggregate loads active holds; contract suites; BEGIN IMMEDIATE |
| 5 | `05-use-cases` | 5.1–5.7 | feat(api): extend, release, mark purchased and list-view use cases |
| 6 | `06-api` | 6.1–6.5 | feat(api): hold lifecycle routes, error codes and HOLD_DURATION_DAYS |
| 7 | `07-rebuild` | 7.1 | feat(api): minimal rebuildProjections (D18) |
| 8 | `08-web-e2e` | 8.1–8.5 | feat(web): Your holds, dialog-open idempotency key, e2e |

Opening each PR, after its last task is committed:

```bash
git push -u origin feat/holds-a/NN-name
gh pr create --base <previous branch, or main for PR 1> --head feat/holds-a/NN-name \
  --title "<title from the table>" --body-file <body file written to the scratchpad>
```

The body lists what the PR ships, the tasks it covers, and the "recreate dev databases" line (PRs 2, 4, 6 and 7 change the schema or the data written). It ends with the attribution block above.

---

## PR 1 — docs (`feat/holds-a/01-docs`, base `main`)

### Task 1.1: Plan, Wishlist aggregate-root ADR, ADR-0075 acceptance, spec and roadmap updates

**Files:**
- Create: `docs/superpowers/plans/2026-10-01-holds-stack-a-guest-manages-a-hold.md` (this file, already written)
- Create: `docs/adr/0078-wishlist-is-the-aggregate-root.md`
- Modify: `docs/adr/README.md` (index rows for 075 and 078)
- Modify: `docs/adr/0075-ledger-events-record-the-acting-role.md:3` (status)
- Modify: `docs/spec/data-and-persistence.md` (item_state bullet; actor bullet)
- Modify: `docs/spec/backend-architecture.md:17` (`EventStore.append` signature)
- Modify: `docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md` (status line; open items 1 and 4)
- Modify: `docs/superpowers/specs/2026-09-30-holds-lifecycle-design.md:3-5` (status line)

**Interfaces:**
- Consumes: nothing.
- Produces: ADR-0078, which later tasks cite in code comments as `ADR-0078`.

- [ ] **Step 1: Write ADR-0078**

Create `docs/adr/0078-wishlist-is-the-aggregate-root.md`:

```markdown
# 0078. Wishlist is the aggregate root for its items and holds

- **Status:** Accepted
- **Date:** 2026-09-13
- **Deciders:** dtbiedrzycki

## Context

The walking skeleton let use cases load an `Item` through an
`ItemRepository` of their own. Two independent design reviews of the
skeleton (2026-09-13) found two problems with that. The rule deciding
whether a caller may act on an item at all, "is it on the list you
are keyed into?", had no single owner. And the write path had started
deciding availability itself (`markHeld` recomputing `active_holds`).
The code was retrofitted so that `Wishlist` owns its items, but no
ADR recorded the decision (roadmap open item 1).

Sub-project 2 makes the answer load-bearing. The hold lifecycle needs
availability decided from hold state, and the concurrent-hold cap
(ADR-[046](./0046-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md))
is the first rule that spans items. ADR-[008](./0008-event-streams-scoped-per-item-not-per-list.md)
scopes event streams per item, which can read as an argument for
`Item` as the root. It is not: that ADR is about storage partitioning
and optimistic concurrency
(ADR-[010](./0010-seq-based-optimistic-concurrency-no-hash-chaining.md)),
not about who enforces invariants.

## Decision

We will treat `Wishlist` as the aggregate root.

- An `Item` is reachable only through the wishlist that owns it, and
  `Wishlist.getItem` is the authorization step. Repositories load and
  store the whole aggregate. There is no use-case-facing item
  repository.
- `Hold` is its own aggregate, referenced by `itemId`; `Contribution`
  will be too. The wishlist authorizes and decides commands on holds
  (`holdItem`, `extendHold`, `releaseHold`, `purchaseHold`), and the
  use case persists the results in the same unit of work. A purchase
  is a terminal state of a `Hold`, not a separate aggregate.
- The aggregate carries a snapshot of the list's active holds, loaded
  with it, so list-wide rules (availability from hold state, the
  session cap) are decided in the domain rather than in a use case or
  a query.
- Event streams stay per item. The aggregate decides; each item's
  stream records the decision and is where seq-based concurrency
  applies.
- Plain-CRUD records (`GuestPii`, `GuestDataAccess`, `ThankYouStatus`,
  `ManualGiftEntry`) sit outside the aggregate and are referenced by id.

## Alternatives considered

- **`Item` as the aggregate root, matching the streams** — rejected:
  the cap spans items. Per-item roots could enforce it only through a
  domain service reading other roots, and "is this item on your list"
  would live outside the domain.
- **One aggregate per list with one list-wide stream** — rejected: it
  contradicts ADR-008, and unrelated holds on different items would
  conflict with each other.
- **No explicit root (a repository per entity, rules in use cases)** —
  rejected: this is the shape the skeleton reviews found rules leaking
  out of, including a write path that decided availability.

## Consequences

- Loading the aggregate loads its active holds. The load stays bounded
  because only active holds are loaded, never expired or closed ones,
  and a port contract suite pins that boundary (holds-lifecycle D8).
- Cross-item rules are read inside the same transaction as the append,
  serialized by `BEGIN IMMEDIATE`
  ([backend architecture](../spec/backend-architecture.md)).
- The write path persists only what the domain decided
  (`saveItemState`) and never recomputes it.
- A list with very many active holds makes each command's load larger.
  That is acceptable at the scale the
  [performance & resource budget](../spec/performance-and-resource-budget.md)
  assumes; revisit if measurement says otherwise.
```

- [ ] **Step 2: Accept ADR-0075 and index both ADRs**

In `docs/adr/0075-ledger-events-record-the-acting-role.md`, change line 3 from `- **Status:** Proposed` to `- **Status:** Accepted`.

In `docs/adr/README.md`, change the 075 row's last cell from `Proposed` to `Accepted`, and add after the 077 row:

```markdown
| [078](0078-wishlist-is-the-aggregate-root.md) | Wishlist is the aggregate root for its items and holds | Accepted |
```

- [ ] **Step 3: Apply ADR-0075's follow-up spec edits and drop `activeHolds` (D4)**

In `docs/spec/data-and-persistence.md`, replace the line:

```markdown
  - `item_state` (lastSeq, activeHolds, purchasedCount, pledgedMinor, confirmedMinor)
```

with:

```markdown
  - `item_state` (lastSeq, purchasedCount, pledgedMinor, confirmedMinor).
    Hold liveness is read from `holds` rows, never kept as a counter:
    under lazy expiry nothing is written when a hold expires, so a
    counter could not stay honest (holds-lifecycle D4).
```

and insert after the line `- Global auto-increment \`id\` gives cross-stream ordering for list-level views`:

```markdown
- **Each event row records the acting role** in an `actor` column
  (`guest` or `owner`, `NOT NULL` with a check constraint) beside
  `event_type` and `seq`: envelope metadata, never a payload field,
  derived from the credential that authorised the command and never
  from request input. *(ADR-[075](../adr/0075-ledger-events-record-the-acting-role.md))*
```

In `docs/spec/backend-architecture.md`, replace:

```markdown
- **`EventStore`** — `append(itemId, expectedSeq, events)`, throws `ConcurrencyError`.
```

with:

```markdown
- **`EventStore`** — `append(itemId, expectedSeq, events, actor)`, throws `ConcurrencyError`. `actor` is the role that authorised the command, supplied by the use case (ADR-[075](../adr/0075-ledger-events-record-the-acting-role.md)).
```

- [ ] **Step 4: Update the roadmap and the spec status line**

In `docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md`:

- In the **Status** paragraph, replace `sub-project 2 is in
design ([draft spec](../specs/2026-09-30-holds-lifecycle-design.md))` with `sub-project 2 is in
progress ([spec](../specs/2026-09-30-holds-lifecycle-design.md); stack A [plan](2026-10-01-holds-stack-a-guest-manages-a-hold.md))`.
- In the sub-project table's row 2, replace `**Holds lifecycle** — *in design* ([draft spec](../specs/2026-09-30-holds-lifecycle-design.md))` with `**Holds lifecycle** — *in progress* ([spec](../specs/2026-09-30-holds-lifecycle-design.md))`.
- Replace open item 1's text with:

```markdown
1. ~~**Write the ADR for `Wishlist` as aggregate root.**~~ Done:
   ADR-[078](../../adr/0078-wishlist-is-the-aggregate-root.md) (holds stack A, PR 1).
```

- Replace open item 4's text with:

```markdown
4. ~~**Playwright e2e** did not run in some sandboxes because no browser was
   installed.~~ Confirmed running in CI: `main` at `11cf71f` (run
   36897900694, 2026-10-01) ran the `e2e` job's `npm run test:e2e` step to
   success, and it passes locally in the dev image. Playwright fails a run
   that finds no tests, so success means the spec actually ran.
```

In `docs/superpowers/specs/2026-09-30-holds-lifecycle-design.md`, replace the status lines 3–5:

```markdown
**Status:** Approved (written spec reviewed and approved 2026-10-01).
Next: stack A's implementation plan; later stacks are planned when they
start (D20).
```

with:

```markdown
**Status:** Approved (written spec reviewed and approved 2026-10-01).
Stack A is planned in
[2026-10-01-holds-stack-a-guest-manages-a-hold.md](../plans/2026-10-01-holds-stack-a-guest-manages-a-hold.md);
later stacks are planned when they start (D20).
```

- [ ] **Step 5: Check every link resolves**

Run: `python3 scripts/check_adr_links.py && python3 scripts/check_adr_links.py docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md docs/superpowers/specs/2026-09-30-holds-lifecycle-design.md`
Expected: `All links resolve.` twice. The first is CI's own `docs-links` check. Don't point the checker at all of `docs/superpowers`: older plans quote link snippets that were never meant to resolve, and this plan quotes ADR text whose links resolve only from `docs/adr/`.

- [ ] **Step 6: Commit and open PR 1**

```bash
git add docs/adr/0078-wishlist-is-the-aggregate-root.md docs/adr/README.md \
  docs/adr/0075-ledger-events-record-the-acting-role.md docs/spec/data-and-persistence.md \
  docs/spec/backend-architecture.md docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md \
  docs/superpowers/plans/2026-10-01-holds-stack-a-guest-manages-a-hold.md \
  docs/superpowers/specs/2026-09-30-holds-lifecycle-design.md
git commit -m "docs: holds stack A plan, Wishlist aggregate-root ADR, ADR-0075 accepted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
git push -u origin feat/holds-a/01-docs
```

Open the PR against `main` as described under **PR map**.

---

## PR 2 — schema amendment and event envelope (`feat/holds-a/02-schema-envelope`, base `feat/holds-a/01-docs`)

```bash
git switch -c feat/holds-a/02-schema-envelope feat/holds-a/01-docs
```

### Task 2.1: Hold lifecycle columns, `purchased_count`, checks and indexes

`item_state.active_holds` stays for now. The domain still reads it until PR 4 replaces it with hold-state availability, which drops the column in the same commit.

**Files:**
- Create: `apps/api/src/infrastructure/db/schema.integration.test.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts`
- Modify: `apps/api/src/infrastructure/db/schema.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `HoldsTable.extended_at | released_at | purchased_at: string | null`
  - `ItemStateTable.purchased_count: Generated<number>`
  - check constraint `holds_released_or_purchased`
  - indexes `holds_item_id_idx` and `holds_session_hash_idx`

- [ ] **Step 1: Write the failing schema tests**

Create `apps/api/src/infrastructure/db/schema.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql, type Insertable, type Kysely } from 'kysely';
import { createDb } from './createDb.js';
import { migrateToLatest } from './migrate.js';
import type { Database, HoldsTable } from './schema.js';

const W1 = '11111111-1111-7111-8111-111111111111';
const I1 = '33333333-3333-7333-8333-333333333333';
const NOW = '2026-01-01T00:00:00.000Z';

let db: Kysely<Database>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  await db.insertInto('wishlists').values({ id: W1, slug: 's', title: 't', owner_token: 'o', key: 'k', key_gen: 1, created_at: NOW }).execute();
  await db.insertInto('items').values({ id: I1, wishlist_id: W1, type: 'single', title: 'Cot', quantity: 1, created_at: NOW }).execute();
});

afterEach(async () => {
  await db.destroy();
});

function holdRow(overrides: Partial<Insertable<HoldsTable>> = {}): Insertable<HoldsTable> {
  return {
    id: '55555555-5555-7555-8555-555555555555', item_id: I1, secret: 's', session_hash: 'a'.repeat(64),
    idempotency_key: 'idem-1', expires_at: NOW, created_at: NOW, ...overrides,
  };
}

describe('0001_init, as amended for holds stack A', () => {
  it("stores a hold's lifecycle timestamps, each null until set", async () => {
    await db.insertInto('holds').values(holdRow()).execute();

    const row = await db.selectFrom('holds').select(['extended_at', 'released_at', 'purchased_at']).executeTakeFirstOrThrow();

    expect(row).toEqual({ extended_at: null, released_at: null, purchased_at: null });
  });

  it('refuses a hold that is both released and purchased', async () => {
    await expect(db.insertInto('holds').values(holdRow({ released_at: NOW, purchased_at: NOW })).execute())
      .rejects.toThrow(/CHECK constraint failed/);
  });

  it("defaults an item's purchased_count to 0", async () => {
    await db.insertInto('item_state').values({ item_id: I1, seq: 0, active_holds: 0, updated_at: NOW }).execute();

    const row = await db.selectFrom('item_state').select('purchased_count').executeTakeFirstOrThrow();

    expect(row.purchased_count).toBe(0);
  });

  it('refuses a negative purchased_count', async () => {
    await expect(db.insertInto('item_state').values({ item_id: I1, seq: 0, active_holds: 0, purchased_count: -1, updated_at: NOW }).execute())
      .rejects.toThrow(/CHECK constraint failed/);
  });

  it('indexes holds by item and by session', async () => {
    const { rows } = await sql<{ name: string }>`select name from pragma_index_list('holds')`.execute(db);

    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(['holds_item_id_idx', 'holds_session_hash_idx']));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test --workspace=apps/api -- src/infrastructure/db/schema.integration.test.ts`
Expected: FAIL. TypeScript-unknown columns are only a type error, so vitest still runs, and SQLite reports `table holds has no column named released_at` / `no such column: purchased_count`. The index test fails on a missing name.

- [ ] **Step 3: Amend `0001_init`**

In `apps/api/src/infrastructure/db/migrations/0001_init.ts`, change the import line to:

```ts
import { sql, type Kysely } from 'kysely';
```

Replace the `item_state` block with:

```ts
  await schema.createTable('item_state').ifNotExists()
    .addColumn('item_id', 'text', (col) => col.primaryKey().references('items.id'))
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('active_holds', 'integer', (col) => col.notNull())
    // Purchases are terminal (holds spec), so this count only ever grows and
    // no lazily-computed rule can leave it stale — unlike an active-hold
    // count, which is why liveness is read from `holds` rows instead
    // (holds-lifecycle D4).
    .addColumn('purchased_count', 'integer', (col) => col.notNull().defaultTo(0).check(sql`purchased_count >= 0`))
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();
```

Replace the `holds` block with:

```ts
  await schema.createTable('holds').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('item_id', 'text', (col) => col.notNull().references('items.id'))
    .addColumn('secret', 'text', (col) => col.notNull())
    .addColumn('session_hash', 'text', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull())
    // Every instant below is written with toISOString(), so text comparison
    // is time order — findActiveForWishlist relies on it.
    .addColumn('expires_at', 'text', (col) => col.notNull())
    // Hold state is timestamps only; statusAt(now) derives active/expired/
    // released/purchased from them (holds-lifecycle D5).
    .addColumn('extended_at', 'text')
    .addColumn('released_at', 'text')
    .addColumn('purchased_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('holds_item_idempotency_key_unique', ['item_id', 'idempotency_key'])
    // A hold ends one way or the other, never both. A backstop: the domain
    // already refuses it (holds-lifecycle §2, D9).
    .addCheckConstraint('holds_released_or_purchased', sql`released_at IS NULL OR purchased_at IS NULL`)
    .execute();

  await schema.createIndex('holds_item_id_idx').ifNotExists().on('holds').column('item_id').execute();
  await schema.createIndex('holds_session_hash_idx').ifNotExists().on('holds').column('session_hash').execute();
```

In `apps/api/src/infrastructure/db/schema.ts`, replace `ItemStateTable` and `HoldsTable` with:

```ts
export interface ItemStateTable {
  item_id: string;
  seq: number;
  active_holds: number;
  purchased_count: Generated<number>;
  updated_at: string;
}

export interface HoldsTable {
  id: string;
  item_id: string;
  secret: string;
  session_hash: string;
  idempotency_key: string;
  expires_at: string;
  extended_at: string | null;
  released_at: string | null;
  purchased_at: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Run the new tests and the API suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS. The new file is green and every existing API test is unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/db
git commit -m "feat(api): hold lifecycle columns, purchased_count, checks and indexes in 0001_init

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 2.2: Event envelope — `actor` on every row, `v: 1` in every payload

**Files:**
- Create: `apps/api/src/domain/Actor.ts`
- Create: `apps/api/src/domain/events/LedgerEvent.ts`
- Modify: `apps/api/src/domain/events/ItemHeldEvent.ts`
- Modify: `apps/api/src/domain/entities/Item.ts:134-143` (`v: 1`)
- Modify: `apps/api/src/application/ports/EventStore.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts` (`InMemoryEventStore`)
- Modify: `apps/api/src/application/test-fakes/builders.ts` (add `anItemHeldEvent`)
- Modify: `apps/api/src/application/use-cases/HoldItem.ts:1,58-62`
- Modify: `apps/api/src/infrastructure/EventStoreKysely.ts`
- Modify: `apps/api/src/infrastructure/LoggingEventStore.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts` (`event_log`)
- Modify: `apps/api/src/infrastructure/db/schema.ts` (`EventLogTable`)
- Test: `apps/api/src/domain/entities/Item.test.ts`, `apps/api/src/application/use-cases/HoldItem.test.ts`, `apps/api/src/infrastructure/LoggingEventStore.test.ts`, `apps/api/src/infrastructure/persistence.integration.test.ts`, `apps/api/src/infrastructure/db/schema.integration.test.ts`

**Interfaces:**
- Consumes: Task 2.1's schema.
- Produces:
  - `type Actor = 'guest' | 'owner'` (`domain/Actor.ts`)
  - `type LedgerEvent = ItemHeldEvent` (`domain/events/LedgerEvent.ts`; PR 3 widens it)
  - `EventStore.append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void>`
  - `InMemoryEventStore.recorded(itemId: string): readonly { event: LedgerEvent; actor: Actor }[]`
  - `anItemHeldEvent(overrides?: Partial<ItemHeldEvent>): ItemHeldEvent` (test builder)
  - `DomainEvent` is deleted

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/domain/entities/Item.test.ts`, in `it('emits an ItemHeld event carrying the hashed secret, not the raw one', …)`, add `v: 1,` after `type: 'ItemHeld',` in the expected object.

In `apps/api/src/application/use-cases/HoldItem.test.ts`, add this test inside `describe('HoldItem', …)`:

```ts
  it('appends ItemHeld to the item stream as the guest (ADR-0075)', async () => {
    const { useCase, wishlists, eventStore } = makeUseCase();
    await seedWishlistWithItem(wishlists);

    await useCase.execute({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    const recorded = eventStore.recorded(ITEM_ID);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].actor).toBe('guest');
    expect(recorded[0].event).toMatchObject({ type: 'ItemHeld', v: 1, itemId: ITEM_ID });
  });
```

Replace `apps/api/src/infrastructure/LoggingEventStore.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { LoggingEventStore } from './LoggingEventStore.js';
import type { EventStore } from '../application/ports/EventStore.js';
import type { Logger } from '../application/ports/Logger.js';
import type { Actor } from '../domain/Actor.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import { anItemHeldEvent } from '../application/test-fakes/builders.js';

describe('LoggingEventStore', () => {
  it('delegates to the inner EventStore and logs after a successful append, actor included', async () => {
    const appended: [string, number, readonly LedgerEvent[], Actor][] = [];
    const inner: EventStore = {
      append: async (itemId, expectedSeq, events, actor) => { appended.push([itemId, expectedSeq, events, actor]); },
    };
    const logs: [string, Record<string, unknown> | undefined][] = [];
    const logger: Logger = { logInfo: (message, meta) => { logs.push([message, meta]); }, logWarn: () => {}, logError: () => {} };
    const decorated = new LoggingEventStore(inner, logger);
    const event = anItemHeldEvent();

    await decorated.append('i1', 0, [event], 'guest');

    expect(appended).toEqual([['i1', 0, [event], 'guest']]);
    expect(logs).toEqual([['event_store.append', { itemId: 'i1', expectedSeq: 0, actor: 'guest', eventTypes: ['ItemHeld'] }]]);
  });

  it('propagates an error from the inner store without logging', async () => {
    const inner: EventStore = { append: async () => { throw new Error('boom'); } };
    const logs: unknown[] = [];
    const logger: Logger = { logInfo: (...args) => { logs.push(args); }, logWarn: () => {}, logError: () => {} };
    const decorated = new LoggingEventStore(inner, logger);

    await expect(decorated.append('i1', 0, [], 'guest')).rejects.toThrow('boom');
    expect(logs).toHaveLength(0);
  });
});
```

In `apps/api/src/infrastructure/persistence.integration.test.ts`, add `import { anItemHeldEvent } from '../application/test-fakes/builders.js';` and replace the whole `describe('EventStoreKysely', …)` block with:

```ts
describe('EventStoreKysely', () => {
  it('appends events when expectedSeq matches the stream length', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    const rows = await db.selectFrom('event_log').selectAll().where('item_id', '=', I1).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(1);
  });

  it('records the actor on the row as envelope metadata, not in the payload (ADR-0075)', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    const row = await db.selectFrom('event_log').select(['actor', 'payload']).where('item_id', '=', I1).executeTakeFirstOrThrow();
    expect(row.actor).toBe('guest');
    expect(JSON.parse(row.payload)).not.toHaveProperty('actor');
    expect(JSON.parse(row.payload)).toMatchObject({ v: 1 });
  });

  it('throws ConcurrencyError when expectedSeq is stale', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    await expect(
      store.append(I1, 0, [anItemHeldEvent({ itemId: I1, holdId: '66666666-6666-7666-8666-666666666666' })], 'guest'),
    ).rejects.toThrow(ConcurrencyError);
  });
});
```

In `apps/api/src/infrastructure/db/schema.integration.test.ts`, add inside the `describe`:

```ts
  it('refuses an event row without an actor', async () => {
    await expect(sql`insert into event_log (item_id, seq, event_type, payload, recorded_at) values (${I1}, 1, 'ItemHeld', '{}', ${NOW})`.execute(db))
      .rejects.toThrow(/NOT NULL constraint failed: event_log.actor/);
  });

  it('refuses an actor other than guest or owner — there is no system role (ADR-0075)', async () => {
    await expect(sql`insert into event_log (item_id, seq, event_type, actor, payload, recorded_at) values (${I1}, 1, 'ItemHeld', 'system', '{}', ${NOW})`.execute(db))
      .rejects.toThrow(/CHECK constraint failed/);
  });

  it('accepts both roles', async () => {
    await sql`insert into event_log (item_id, seq, event_type, actor, payload, recorded_at) values (${I1}, 1, 'ItemHeld', 'guest', '{}', ${NOW})`.execute(db);
    await sql`insert into event_log (item_id, seq, event_type, actor, payload, recorded_at) values (${I1}, 2, 'HoldReleased', 'owner', '{}', ${NOW})`.execute(db);

    const { rows } = await sql<{ actor: string }>`select actor from event_log order by seq`.execute(db);
    expect(rows.map((r) => r.actor)).toEqual(['guest', 'owner']);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test --workspace=apps/api`
Expected: FAIL. `anItemHeldEvent` and `recorded` do not exist yet, the `ItemHeld` event has no `v`, and the `event_log` inserts fail on the missing `actor` column.

- [ ] **Step 3: Add the domain types**

Create `apps/api/src/domain/Actor.ts`:

```ts
/**
 * The role whose credential authorised a ledger command (ADR-0075). Recorded
 * on every event as envelope metadata — never in a payload, never taken
 * from request input. A role, not an identity: owner tokens are shared per
 * list (ADR-0015), so there is no individual owner to name, and there is no
 * `system` role because nothing emits events on its own (hold expiry is
 * derived).
 */
export type Actor = 'guest' | 'owner';
```

Create `apps/api/src/domain/events/LedgerEvent.ts`:

```ts
import type { ItemHeldEvent } from './ItemHeldEvent.js';

/**
 * Every event an item's stream can carry (ADR-0008). A closed union, so a
 * fold over the ledger — rebuildProjections, the actor matrix test — is
 * checked for exhaustiveness by the compiler when a type is added.
 */
export type LedgerEvent = ItemHeldEvent;
```

In `apps/api/src/domain/events/ItemHeldEvent.ts`, add after `type: 'ItemHeld';`:

```ts
  /**
   * Payload version, carried from day one (data & persistence). Bumped only
   * with an upcaster once instances exist; before 1.0 shapes are amended in
   * place at v1 (holds-lifecycle D14).
   */
  v: 1;
```

In `apps/api/src/domain/entities/Item.ts`, in `placeHold`, add `v: 1,` after `type: 'ItemHeld',` in the event literal.

- [ ] **Step 4: Change the port and its implementations**

Replace `apps/api/src/application/ports/EventStore.ts` with:

```ts
import type { Actor } from '../../domain/Actor.js';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';

export interface EventStore {
  /**
   * Appends events to itemId's stream, recording `actor` on each row as
   * envelope metadata (ADR-0075) — the role of the credential that
   * authorised the command, which only the use case knows. Throws
   * ConcurrencyError if the stream's current seq !== expectedSeq.
   */
  append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void>;
}
```

In `apps/api/src/application/test-fakes/InMemoryRepositories.ts`:
- Change the import `import type { EventStore, DomainEvent } from '../ports/EventStore.js';` to `import type { EventStore } from '../ports/EventStore.js';`.
- Add `import type { Actor } from '../../domain/Actor.js';` and `import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';`.
- Replace the `InMemoryEventStore` class with:

```ts
export class InMemoryEventStore implements EventStore {
  private streams = new Map<string, { event: LedgerEvent; actor: Actor }[]>();

  async append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void> {
    const stream = this.streams.get(itemId) ?? [];
    if (stream.length !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, stream.length);
    }
    this.streams.set(itemId, [...stream, ...events.map((event) => ({ event, actor }))]);
  }

  /** What a stream holds, envelope included — tests read it to check what a use case appended and as whom. */
  recorded(itemId: string): readonly { event: LedgerEvent; actor: Actor }[] {
    return this.streams.get(itemId) ?? [];
  }
}
```

In `apps/api/src/application/test-fakes/builders.ts`, add `import type { ItemHeldEvent } from '../../domain/events/ItemHeldEvent.js';` and append:

```ts
/** A well-formed ItemHeld payload for tests that need an event but not a hold. */
export function anItemHeldEvent(overrides: Partial<ItemHeldEvent> = {}): ItemHeldEvent {
  return {
    type: 'ItemHeld', v: 1, itemId: DEFAULT_ITEM_ID, holdId: '55555555-5555-7555-8555-555555555555',
    secretHash: 'f'.repeat(64), sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1',
    expiresAt: '2026-01-04T00:00:00.000Z', occurredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
```

In `apps/api/src/application/use-cases/HoldItem.ts`:
- Delete `import type { DomainEvent } from '../ports/EventStore.js';`.
- Replace the comment and `append` call (lines 58–62) with:

```ts
      // Placing a hold is guest-only (ADR-0075), and HoldItem is only ever
      // reached with a guest session, so the actor is fixed here.
      await ctx.eventStore.append(input.itemId, expectedSeq, [event], 'guest');
```

Replace `apps/api/src/infrastructure/EventStoreKysely.ts`'s `append` with:

```ts
  async append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void> {
    const countRow = await this.db.selectFrom('event_log')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('item_id', '=', itemId)
      .executeTakeFirstOrThrow();
    const currentSeq = Number(countRow.count);
    if (currentSeq !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, currentSeq);
    }

    let seq = expectedSeq;
    for (const event of events) {
      seq += 1;
      await this.db.insertInto('event_log').values({
        item_id: itemId, seq, event_type: event.type, actor,
        payload: JSON.stringify(event), recorded_at: event.occurredAt,
      }).execute();
    }
  }
```

and change its imports to:

```ts
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { EventStore } from '../application/ports/EventStore.js';
import type { Actor } from '../domain/Actor.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import { ConcurrencyError } from '../domain/errors.js';
```

Replace `apps/api/src/infrastructure/LoggingEventStore.ts` with:

```ts
import type { EventStore } from '../application/ports/EventStore.js';
import type { Logger } from '../application/ports/Logger.js';
import type { Actor } from '../domain/Actor.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';

export class LoggingEventStore implements EventStore {
  constructor(
    private inner: EventStore,
    private logger: Logger,
  ) {}

  async append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void> {
    await this.inner.append(itemId, expectedSeq, events, actor);
    this.logger.logInfo('event_store.append', { itemId, expectedSeq, actor, eventTypes: events.map((e) => e.type) });
  }
}
```

- [ ] **Step 5: Add the column**

In `0001_init.ts`, replace the `event_log` block with:

```ts
  await schema.createTable('event_log').ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('item_id', 'text', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('event_type', 'text', (col) => col.notNull())
    // Envelope metadata, not payload (ADR-0075): the role whose credential
    // authorised the command. No `system` role exists; adding one needs an
    // ADR and a migration that widens this check.
    .addColumn('actor', 'text', (col) => col.notNull().check(sql`actor IN ('guest', 'owner')`))
    .addColumn('payload', 'text', (col) => col.notNull())
    .addColumn('recorded_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('event_log_item_seq_unique', ['item_id', 'seq'])
    .execute();
```

In `schema.ts`, add `import type { Actor } from '../../domain/Actor.js';` and add `actor: Actor;` to `EventLogTable` after `event_type: string;`.

- [ ] **Step 6: Run the whole suite**

Run: `npm run lint && npm test`
Expected: PASS. If `tsc` complains about any remaining `DomainEvent` import, it is a leftover; replace it with `LedgerEvent` from `domain/events/LedgerEvent.js`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): record the acting role on every event and version every payload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 2.3: Refuse to start on a database an older build created (Review Focus 1)

**Files:**
- Create: `apps/api/src/infrastructure/db/assertSchemaMatches.ts`
- Modify: `apps/api/src/infrastructure/db/migrate.ts:7-9`
- Test: `apps/api/src/infrastructure/db/schema.integration.test.ts`

**Interfaces:**
- Consumes: `up` from `migrations/0001_init.ts`, `createDb`.
- Produces:
  - `assertSchemaMatches(db: QueryExecutorProvider): Promise<void>`
  - `class StaleSchemaError extends Error`
  - `migrateToLatest` now rejects with `StaleSchemaError` on drift

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/infrastructure/db/schema.integration.test.ts` (new top-level `describe`, after the existing one), and add `import { StaleSchemaError } from './assertSchemaMatches.js';` to the imports:

```ts
describe('migrateToLatest on a database an older build created', () => {
  it('refuses to start, naming the table and how to recover', async () => {
    const stale = createDb(':memory:');
    // The skeleton's event_log, before ADR-0075 added `actor`.
    await sql`create table event_log (id integer primary key autoincrement, item_id text not null, seq integer not null,
      event_type text not null, payload text not null, recorded_at text not null)`.execute(stale);

    const migrating = migrateToLatest(stale);

    await expect(migrating).rejects.toThrow(StaleSchemaError);
    await expect(migrating).rejects.toThrow(/"event_log".*recreate the database.*DATABASE_PATH/s);
    await stale.destroy();
  });

  it('accepts a database the current migration created, run again', async () => {
    await expect(migrateToLatest(db)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test --workspace=apps/api -- src/infrastructure/db/schema.integration.test.ts`
Expected: FAIL. The import of `./assertSchemaMatches.js` cannot be resolved.

- [ ] **Step 3: Implement the guard**

Create `apps/api/src/infrastructure/db/assertSchemaMatches.ts`:

```ts
import { sql, type Kysely, type QueryExecutorProvider } from 'kysely';
import { createDb } from './createDb.js';
import { up } from './migrations/0001_init.js';

export class StaleSchemaError extends Error {}

/** Each table's column names in declaration order, joined — a cheap shape fingerprint. */
async function columnsByTable(db: QueryExecutorProvider): Promise<Map<string, string>> {
  const tables = await sql<{ name: string }>`
    select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name
  `.execute(db);
  const shape = new Map<string, string>();
  for (const { name } of tables.rows) {
    const columns = await sql<{ name: string }>`select name from pragma_table_info(${name}) order by cid`.execute(db);
    shape.set(name, columns.rows.map((c) => c.name).join(', '));
  }
  return shape;
}

/**
 * Until 1.0, 0001_init is amended in place rather than followed by new
 * migrations (holds-lifecycle D14), and its `createTable(...).ifNotExists()`
 * skips any table that already exists. A database an older build created
 * therefore keeps its old shape without complaint, and the first write that
 * touches a changed column fails as a 500 in front of a guest. This compares
 * every table against what the current migration builds on a fresh
 * in-memory database, so drift stops the server at startup with a message
 * that says what to do, instead.
 */
export async function assertSchemaMatches(db: QueryExecutorProvider): Promise<void> {
  const reference = createDb(':memory:');
  try {
    await up(reference as unknown as Kysely<unknown>);
    const expected = await columnsByTable(reference);
    const actual = await columnsByTable(db);
    for (const [table, columns] of expected) {
      const found = actual.get(table);
      if (found !== columns) {
        throw new StaleSchemaError(
          `Database schema is out of date: table "${table}" has columns (${found ?? 'table missing'}) ` +
          `but this build expects (${columns}). 0001_init is amended in place before 1.0, so recreate the ` +
          'database: stop the server, delete the file at DATABASE_PATH, and start it again.',
        );
      }
    }
  } finally {
    await reference.destroy();
  }
}
```

In `apps/api/src/infrastructure/db/migrate.ts`, add `import { assertSchemaMatches } from './assertSchemaMatches.js';` and replace `migrateToLatest` with:

```ts
export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await up(db as unknown as Kysely<unknown>);
  await assertSchemaMatches(db);
}
```

- [ ] **Step 4: Run the suite**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Check the real failure mode by hand**

```bash
S=$(mktemp -d)
# A database with the skeleton's event_log, as a build from before this stack left it.
node -e "const D=require('better-sqlite3');const d=new D('$S/stale.db');d.exec(\"create table event_log (id integer primary key autoincrement, item_id text not null, seq integer not null, event_type text not null, payload text not null, recorded_at text not null)\");d.close()"
DATABASE_PATH=$S/stale.db npm run migrate --workspace=apps/api; echo "exit $?"
rm -f $S/stale.db*
```

Expected: the CLI prints the `StaleSchemaError` message naming `"event_log"` and exits with `exit 1`.

- [ ] **Step 6: Commit and open PR 2**

```bash
git add apps/api/src/infrastructure/db
git commit -m "feat(api): refuse to start on a database an older build created

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
npm run build && npm run test:e2e
git push -u origin feat/holds-a/02-schema-envelope
```

Open the PR against `feat/holds-a/01-docs`.

---

## PR 3 — domain: hold lifecycle (`feat/holds-a/03-domain-lifecycle`, base `feat/holds-a/02-schema-envelope`)

```bash
git switch -c feat/holds-a/03-domain-lifecycle feat/holds-a/02-schema-envelope
```

Everything here is additive to `Hold` plus one rename, so the adapters and use cases keep compiling. The aggregate starts using these methods in PR 4.

### Task 3.1: The lifecycle's domain errors

**Files:**
- Modify: `apps/api/src/domain/errors.ts`
- Modify (rename only): every file under `apps/api/src` that mentions `ItemAlreadyHeldError`

**Interfaces:**
- Produces:
  - `ItemUnavailableError(itemId)` (renamed from `ItemAlreadyHeldError`)
  - `HoldNotFoundError(holdId)`
  - `HoldNotActiveError(holdId)`
  - `HoldAlreadyExtendedError(holdId)`
  - `WishlistNotFoundError(identifier)` (parameter renamed; roadmap open item 3)

- [ ] **Step 1: Rewrite `errors.ts`**

Replace `apps/api/src/domain/errors.ts` with:

```ts
export class DomainValidationError extends Error {}
export class ItemNotFoundError extends Error {
  constructor(itemId: string) { super(`Item not found: ${itemId}`); }
}
/**
 * `identifier` is whatever the caller looked the list up by — a slug or an
 * id. A lookup by slug has no id to report (roadmap open item 3).
 */
export class WishlistNotFoundError extends Error {
  constructor(identifier: string) { super(`Wishlist not found: ${identifier}`); }
}
/**
 * No unit of the item is free: active holds and purchases already cover its
 * quantity. Presented as 409 `item_unavailable`.
 */
export class ItemUnavailableError extends Error {
  constructor(itemId: string) { super(`Item unavailable: ${itemId}`); }
}
export class InvalidGuestKeyError extends Error {
  constructor(wishlistId: string) { super(`Invalid guest key for wishlist: ${wishlistId}`); }
}
export class ConcurrencyError extends Error {
  constructor(itemId: string, expectedSeq: number, actualSeq: number) {
    super(`Concurrency conflict on item ${itemId}: expected seq ${expectedSeq}, actual ${actualSeq}`);
  }
}
/**
 * No such hold on this list — or a hold the caller may not act on, which is
 * deliberately the same failure: a guest learns nothing about holds that are
 * not theirs (generic 404, ADR-0016/0054).
 */
export class HoldNotFoundError extends Error {
  constructor(holdId: string) { super(`Hold not found: ${holdId}`); }
}
/** The command needs an active hold and this one has expired, been released, or been purchased. 409 `hold_not_active`. */
export class HoldNotActiveError extends Error {
  constructor(holdId: string) { super(`Hold not active: ${holdId}`); }
}
/** The hold has used its one extension (ADR-0002). 409 `hold_already_extended`. */
export class HoldAlreadyExtendedError extends Error {
  constructor(holdId: string) { super(`Hold already extended: ${holdId}`); }
}
```

- [ ] **Step 2: Rename every use**

```bash
grep -rl ItemAlreadyHeldError apps/api/src | xargs sed -i 's/ItemAlreadyHeldError/ItemUnavailableError/g'
grep -rn "ItemAlreadyHeld" apps/api/src || echo "none left"
```

Expected: `none left`.

- [ ] **Step 3: Run the suite**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS. This is a pure rename; no behaviour changes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): the hold lifecycle's domain errors; ItemAlreadyHeld becomes ItemUnavailable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 3.2: Hold state is timestamps; `statusAt(now)` derives it

**Files:**
- Modify: `apps/api/src/domain/entities/Hold.ts`
- Test: `apps/api/src/domain/entities/Hold.test.ts`

**Interfaces:**
- Consumes: Task 3.1 errors.
- Produces:
  - `type HoldStatus = 'active' | 'expired' | 'released' | 'purchased'`
  - `Hold.reconstitute(props: { id: string; itemId: string; secret: string; sessionHash: string; idempotencyKey: string; expiresAt: Date; extendedAt: Date | null; releasedAt: Date | null; purchasedAt: Date | null }): Hold`
  - getters `expiresAt: Date`, `extendedAt`, `releasedAt`, `purchasedAt` (each `Date | null`)
  - `Hold.statusAt(now: Date): HoldStatus`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/domain/entities/Hold.test.ts`:

```ts
const HOLD_ID = '55555555-5555-7555-8555-555555555555';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const EXPIRES_AT = new Date('2026-01-04T00:00:00.000Z');
const msFromExpiry = (ms: number) => new Date(EXPIRES_AT.getTime() + ms);

function persisted(overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}) {
  return Hold.reconstitute({
    id: HOLD_ID, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1',
    expiresAt: EXPIRES_AT, extendedAt: null, releasedAt: null, purchasedAt: null, ...overrides,
  });
}

describe('Hold.reconstitute', () => {
  it('accepts an expiresAt in the past — a stored hold may well have expired since', () => {
    expect(persisted({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }).expiresAt).toEqual(new Date('2020-01-01T00:00:00.000Z'));
  });

  it('restores the lifecycle timestamps', () => {
    const extendedAt = msFromExpiry(-86_400_000);
    const releasedAt = msFromExpiry(-1_000);
    const hold = persisted({ extendedAt, releasedAt });
    expect(hold.extendedAt).toEqual(extendedAt);
    expect(hold.releasedAt).toEqual(releasedAt);
    expect(hold.purchasedAt).toBeNull();
  });

  it('refuses a hold that is both released and purchased', () => {
    expect(() => persisted({ releasedAt: EXPIRES_AT, purchasedAt: EXPIRES_AT })).toThrow(DomainValidationError);
  });

  it('enforces the value-object invariants on persisted rows too', () => {
    expect(() => persisted({ sessionHash: 'nope' })).toThrow(DomainValidationError);
  });
});

describe('Hold.statusAt — the one definition of hold state (D5)', () => {
  it.each([
    ['1 ms before expiresAt', -1, 'active'],
    ['at expiresAt exactly', 0, 'active'],
    ['1 ms after expiresAt', 1, 'expired'],
  ] as const)('%s, an open hold is %s', (_when, offset, status) => {
    expect(persisted().statusAt(msFromExpiry(offset))).toBe(status);
  });

  it('is released once releasedAt is set, before or after expiry', () => {
    const hold = persisted({ releasedAt: msFromExpiry(-10) });
    expect(hold.statusAt(msFromExpiry(-1))).toBe('released');
    expect(hold.statusAt(msFromExpiry(1))).toBe('released');
  });

  it('is purchased once purchasedAt is set, even long after expiry', () => {
    expect(persisted({ purchasedAt: msFromExpiry(5) }).statusAt(msFromExpiry(86_400_000))).toBe('purchased');
  });

  it('starts a newly created hold active, with no lifecycle timestamps', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const hold = Hold.create({
      id: HOLD_ID, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: 'a'.repeat(64),
      idempotencyKey: 'idem-1', expiresAt: EXPIRES_AT, now,
    });
    expect(hold.statusAt(now)).toBe('active');
    expect([hold.extendedAt, hold.releasedAt, hold.purchasedAt]).toEqual([null, null, null]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test --workspace=apps/api -- src/domain/entities/Hold.test.ts`
Expected: FAIL with `Hold.reconstitute is not a function`.

- [ ] **Step 3: Implement**

Replace `apps/api/src/domain/entities/Hold.ts` with:

```ts
import { DomainValidationError } from '../errors.js';
import { HoldSecret } from '../value-objects/HoldSecret.js';
import { IdempotencyKey } from '../value-objects/IdempotencyKey.js';
import { SessionHash } from '../value-objects/SessionHash.js';
import { UuidId } from '../value-objects/UuidId.js';

/**
 * A hold's state at some instant. Never stored: `statusAt` derives it from
 * the timestamps, so nothing has to be written when a hold expires
 * (holds-lifecycle D4, D5; ADR-0002's lazy expiry).
 */
export type HoldStatus = 'active' | 'expired' | 'released' | 'purchased';

export class Hold {
  /**
   * Enforces the one invariant between the timestamps, so neither factory
   * can produce a hold that ended two ways. The lifecycle fields are private
   * and mutable because the hold's own commands (extend, release,
   * markPurchased) change them in place — sound only because every
   * aggregate is loaded fresh per unit of work, as `Item.placeHold` already
   * assumes.
   */
  private constructor(
    readonly id: UuidId,
    readonly itemId: UuidId,
    readonly secret: HoldSecret,
    readonly sessionHash: SessionHash,
    readonly idempotencyKey: IdempotencyKey,
    private _expiresAt: Date,
    private _extendedAt: Date | null,
    private _releasedAt: Date | null,
    private _purchasedAt: Date | null,
  ) {
    if (_releasedAt !== null && _purchasedAt !== null) {
      throw new DomainValidationError('A hold cannot be both released and purchased');
    }
  }

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
      UuidId.from(props.id), UuidId.from(props.itemId), secret, sessionHash, idempotencyKey,
      props.expiresAt, null, null, null,
    );
  }

  /**
   * Reconstructs a Hold from persisted fields. Unlike `create`, an
   * `expiresAt` in the past is fine: a stored hold may well have expired
   * since, and expiry is computed, not recorded.
   */
  static reconstitute(props: {
    id: string; itemId: string; secret: string; sessionHash: string; idempotencyKey: string;
    expiresAt: Date; extendedAt: Date | null; releasedAt: Date | null; purchasedAt: Date | null;
  }): Hold {
    return new Hold(
      UuidId.from(props.id), UuidId.from(props.itemId), HoldSecret.from(props.secret),
      SessionHash.from(props.sessionHash), IdempotencyKey.from(props.idempotencyKey),
      props.expiresAt, props.extendedAt, props.releasedAt, props.purchasedAt,
    );
  }

  get expiresAt(): Date { return this._expiresAt; }
  get extendedAt(): Date | null { return this._extendedAt; }
  get releasedAt(): Date | null { return this._releasedAt; }
  get purchasedAt(): Date | null { return this._purchasedAt; }

  /**
   * The one definition of hold state (holds-lifecycle §1). Strictly after:
   * at the very instant `now === expiresAt` the hold is still active, as the
   * holds spec's `now > expiresAt` says.
   */
  statusAt(now: Date): HoldStatus {
    if (this._purchasedAt !== null) return 'purchased';
    if (this._releasedAt !== null) return 'released';
    if (now.getTime() > this._expiresAt.getTime()) return 'expired';
    return 'active';
  }
}
```

- [ ] **Step 4: Run the suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS. Existing `hold.expiresAt` readers work unchanged through the getter.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/entities/Hold.ts apps/api/src/domain/entities/Hold.test.ts
git commit -m "feat(api): hold state as timestamps with a derived statusAt(now)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 3.3: `extend`, `release`, `markPurchased` and their events

**Files:**
- Create: `apps/api/src/domain/events/HoldExtendedEvent.ts`, `HoldReleasedEvent.ts`, `ItemPurchasedEvent.ts`
- Modify: `apps/api/src/domain/events/LedgerEvent.ts`
- Modify: `apps/api/src/domain/entities/Hold.ts`
- Test: `apps/api/src/domain/entities/Hold.test.ts`

**Interfaces:**
- Consumes: Task 3.2's `Hold`, Task 3.1's errors.
- Produces:
  - `HoldExtendedEvent { type: 'HoldExtended'; v: 1; holdId: string; expiresAt: string; occurredAt: string }`
  - `HoldReleasedEvent { type: 'HoldReleased'; v: 1; holdId: string; occurredAt: string }`
  - `ItemPurchasedEvent { type: 'ItemPurchased'; v: 1; holdId: string; occurredAt: string }`
  - `LedgerEvent = ItemHeldEvent | HoldExtendedEvent | HoldReleasedEvent | ItemPurchasedEvent`
  - `Hold.extend(now: Date, durationMs: number): HoldExtendedEvent`
  - `Hold.release(now: Date): HoldReleasedEvent`
  - `Hold.markPurchased(now: Date): ItemPurchasedEvent`
  - `Hold.belongsToSession(sessionHash: string): boolean`
  - `Hold.canExtendAt(now: Date): boolean`
  - `Hold.canReleaseAt(now: Date): boolean`

- [ ] **Step 1: Write the failing tests**

Add `HoldAlreadyExtendedError, HoldNotActiveError` to the `../errors.js` import in `Hold.test.ts`, then append:

```ts
const DAY = 86_400_000;
const CREATED = new Date(EXPIRES_AT.getTime() - 3 * DAY);

describe('Hold.extend', () => {
  it('adds the duration to the current expiresAt — not to now — and stamps extendedAt', () => {
    const hold = persisted();
    const now = new Date(CREATED.getTime() + DAY);

    hold.extend(now, 3 * DAY);

    expect(hold.expiresAt).toEqual(new Date(EXPIRES_AT.getTime() + 3 * DAY));
    expect(hold.extendedAt).toEqual(now);
  });

  it('returns HoldExtended carrying the new expiry', () => {
    const now = new Date(CREATED.getTime() + DAY);
    expect(persisted().extend(now, 3 * DAY)).toEqual({
      type: 'HoldExtended', v: 1, holdId: HOLD_ID,
      expiresAt: new Date(EXPIRES_AT.getTime() + 3 * DAY).toISOString(), occurredAt: now.toISOString(),
    });
  });

  it('allows the extension at the very instant the hold expires', () => {
    expect(() => persisted().extend(EXPIRES_AT, DAY)).not.toThrow();
  });

  it('refuses a second extension and leaves the hold as it was', () => {
    const hold = persisted();
    hold.extend(CREATED, DAY);
    const expiresAfterFirst = hold.expiresAt;

    expect(() => hold.extend(CREATED, DAY)).toThrow(HoldAlreadyExtendedError);
    expect(hold.expiresAt).toEqual(expiresAfterFirst);
  });

  it.each([
    ['expired', persisted, msFromExpiry(1)],
    ['released', () => persisted({ releasedAt: CREATED }), CREATED],
    ['purchased', () => persisted({ purchasedAt: CREATED }), CREATED],
  ] as const)('refuses a %s hold', (_state, make, now) => {
    expect(() => make().extend(now, DAY)).toThrow(HoldNotActiveError);
  });

  it('refuses a duration that is not a positive whole number of milliseconds', () => {
    expect(() => persisted().extend(CREATED, 0)).toThrow(DomainValidationError);
    expect(() => persisted().extend(CREATED, 1.5)).toThrow(DomainValidationError);
  });
});

describe('Hold.release', () => {
  it('stamps releasedAt and returns HoldReleased', () => {
    const hold = persisted();
    expect(hold.release(CREATED)).toEqual({ type: 'HoldReleased', v: 1, holdId: HOLD_ID, occurredAt: CREATED.toISOString() });
    expect(hold.statusAt(CREATED)).toBe('released');
  });

  it.each([
    ['expired', persisted, msFromExpiry(1)],
    ['released', () => persisted({ releasedAt: CREATED }), CREATED],
    ['purchased', () => persisted({ purchasedAt: CREATED }), CREATED],
  ] as const)('refuses a %s hold', (_state, make, now) => {
    expect(() => make().release(now)).toThrow(HoldNotActiveError);
  });
});

describe('Hold.markPurchased', () => {
  it('stamps purchasedAt and returns ItemPurchased', () => {
    const hold = persisted();
    expect(hold.markPurchased(CREATED)).toEqual({ type: 'ItemPurchased', v: 1, holdId: HOLD_ID, occurredAt: CREATED.toISOString() });
    expect(hold.statusAt(CREATED)).toBe('purchased');
  });

  it('accepts an expired hold — whether a unit is still free is the wishlist\'s call (D15)', () => {
    expect(() => persisted().markPurchased(msFromExpiry(1))).not.toThrow();
  });

  it.each([
    ['released', () => persisted({ releasedAt: CREATED })],
    ['purchased', () => persisted({ purchasedAt: CREATED })],
  ] as const)('refuses a %s hold — both are terminal', (_state, make) => {
    expect(() => make().markPurchased(CREATED)).toThrow(HoldNotActiveError);
  });
});

describe('Hold predicates', () => {
  it('belongsToSession compares the stored session hash', () => {
    expect(persisted().belongsToSession('a'.repeat(64))).toBe(true);
    expect(persisted().belongsToSession('b'.repeat(64))).toBe(false);
  });

  it('canExtendAt: active and never extended', () => {
    expect(persisted().canExtendAt(CREATED)).toBe(true);
    expect(persisted({ extendedAt: CREATED }).canExtendAt(CREATED)).toBe(false);
    expect(persisted().canExtendAt(msFromExpiry(1))).toBe(false);
  });

  it('canReleaseAt: active, extended or not', () => {
    expect(persisted({ extendedAt: CREATED }).canReleaseAt(CREATED)).toBe(true);
    expect(persisted({ purchasedAt: CREATED }).canReleaseAt(CREATED)).toBe(false);
    expect(persisted().canReleaseAt(msFromExpiry(1))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test --workspace=apps/api -- src/domain/entities/Hold.test.ts`
Expected: FAIL with `hold.extend is not a function` (and likewise for the others).

- [ ] **Step 3: Add the event types**

Create `apps/api/src/domain/events/HoldExtendedEvent.ts`:

```ts
/** A hold's one extension (ADR-0002). `expiresAt` is the new expiry, already including the added duration. */
export interface HoldExtendedEvent {
  type: 'HoldExtended';
  v: 1;
  holdId: string;
  expiresAt: string; // ISO 8601
  occurredAt: string; // ISO 8601 — folds into holds.extended_at
}
```

Create `apps/api/src/domain/events/HoldReleasedEvent.ts`:

```ts
/** A hold given up before it expired. Who released it is the envelope's `actor`, not a payload field (ADR-0075). */
export interface HoldReleasedEvent {
  type: 'HoldReleased';
  v: 1;
  holdId: string;
  occurredAt: string; // ISO 8601 — folds into holds.released_at
}
```

Create `apps/api/src/domain/events/ItemPurchasedEvent.ts`:

```ts
/** A hold that ended in a purchase. Terminal (holds spec): only the owner can undo it, with PurchaseVoided in sub-project 4. */
export interface ItemPurchasedEvent {
  type: 'ItemPurchased';
  v: 1;
  holdId: string;
  occurredAt: string; // ISO 8601 — folds into holds.purchased_at and item_state.purchased_count
}
```

Replace `apps/api/src/domain/events/LedgerEvent.ts` with:

```ts
import type { HoldExtendedEvent } from './HoldExtendedEvent.js';
import type { HoldReleasedEvent } from './HoldReleasedEvent.js';
import type { ItemHeldEvent } from './ItemHeldEvent.js';
import type { ItemPurchasedEvent } from './ItemPurchasedEvent.js';

/**
 * Every event an item's stream can carry (ADR-0008). A closed union, so a
 * fold over the ledger — rebuildProjections, the actor matrix test — is
 * checked for exhaustiveness by the compiler when a type is added.
 */
export type LedgerEvent = ItemHeldEvent | HoldExtendedEvent | HoldReleasedEvent | ItemPurchasedEvent;
```

- [ ] **Step 4: Add the commands to `Hold`**

In `apps/api/src/domain/entities/Hold.ts`, change the errors import to:

```ts
import { DomainValidationError, HoldAlreadyExtendedError, HoldNotActiveError } from '../errors.js';
import type { HoldExtendedEvent } from '../events/HoldExtendedEvent.js';
import type { HoldReleasedEvent } from '../events/HoldReleasedEvent.js';
import type { ItemPurchasedEvent } from '../events/ItemPurchasedEvent.js';
```

and add these methods after `statusAt`:

```ts
  /**
   * A plain comparison: both sides are SHA-256 digests of a session id, not
   * the secret itself, so timing here can at most reveal a digest prefix
   * (contrast ADR-0035's constant-time rule for the secrets themselves).
   */
  belongsToSession(sessionHash: string): boolean {
    return this.sessionHash.value === sessionHash;
  }

  canExtendAt(now: Date): boolean {
    return this.statusAt(now) === 'active' && this._extendedAt === null;
  }

  canReleaseAt(now: Date): boolean {
    return this.statusAt(now) === 'active';
  }

  /**
   * The one self-service extension (ADR-0002): only while active, only
   * once. Adds `durationMs` to the *current* expiry rather than to `now`,
   * so the most a hold can ever last is twice the configured duration.
   */
  extend(now: Date, durationMs: number): HoldExtendedEvent {
    if (!Number.isInteger(durationMs) || durationMs <= 0) {
      throw new DomainValidationError('Hold extension must be a positive whole number of milliseconds');
    }
    if (this.statusAt(now) !== 'active') throw new HoldNotActiveError(this.id.value);
    if (this._extendedAt !== null) throw new HoldAlreadyExtendedError(this.id.value);
    this._extendedAt = now;
    this._expiresAt = new Date(this._expiresAt.getTime() + durationMs);
    return { type: 'HoldExtended', v: 1, holdId: this.id.value, expiresAt: this._expiresAt.toISOString(), occurredAt: now.toISOString() };
  }

  release(now: Date): HoldReleasedEvent {
    if (this.statusAt(now) !== 'active') throw new HoldNotActiveError(this.id.value);
    this._releasedAt = now;
    return { type: 'HoldReleased', v: 1, holdId: this.id.value, occurredAt: now.toISOString() };
  }

  /**
   * Ends the hold in a purchase. Refuses only the terminal states: an
   * expired hold may still be purchased when its item has a free unit
   * (holds-lifecycle D15), and only the wishlist — which sees the other
   * holds — can tell, so reach this through `Wishlist.purchaseHold`.
   */
  markPurchased(now: Date): ItemPurchasedEvent {
    if (this._purchasedAt !== null || this._releasedAt !== null) throw new HoldNotActiveError(this.id.value);
    this._purchasedAt = now;
    return { type: 'ItemPurchased', v: 1, holdId: this.id.value, occurredAt: now.toISOString() };
  }
```

- [ ] **Step 5: Run the suite**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain
git commit -m "feat(api): extend once, release and mark purchased on Hold, with their events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 3.4: `HoldPermissions` — the guest rows

**Files:**
- Create: `apps/api/src/domain/policies/HoldPermissions.ts`
- Test: `apps/api/src/domain/policies/HoldPermissions.test.ts`

**Interfaces:**
- Consumes: `Hold.belongsToSession`, `Actor`.
- Produces:
  - `interface HoldCredentials { guestSession: { sessionHash: string } | null }`
  - `HoldPermissions.mayExtend(hold: Hold, credentials: HoldCredentials): Actor | null`, and likewise `mayRelease` and `mayPurchase`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/domain/policies/HoldPermissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HoldPermissions } from './HoldPermissions.js';
import { Hold } from '../entities/Hold.js';

const SESSION = 'a'.repeat(64);
const hold = Hold.reconstitute({
  id: '55555555-5555-7555-8555-555555555555', itemId: '33333333-3333-7333-8333-333333333333',
  secret: 'hold-secret', sessionHash: SESSION, idempotencyKey: 'idem-1',
  expiresAt: new Date('2026-01-04T00:00:00.000Z'), extendedAt: null, releasedAt: null, purchasedAt: null,
});
const commands = ['mayExtend', 'mayRelease', 'mayPurchase'] as const;

describe('HoldPermissions — guest rows (holds-lifecycle §1, stack A)', () => {
  it.each(commands)('%s: the session that placed the hold acts, as the guest', (command) => {
    expect(HoldPermissions[command](hold, { guestSession: { sessionHash: SESSION } })).toBe('guest');
  });

  it.each(commands)('%s: another session may not', (command) => {
    expect(HoldPermissions[command](hold, { guestSession: { sessionHash: 'b'.repeat(64) } })).toBeNull();
  });

  it.each(commands)('%s: a caller with no session may not', (command) => {
    expect(HoldPermissions[command](hold, { guestSession: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- src/domain/policies`
Expected: FAIL. `./HoldPermissions.js` cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/api/src/domain/policies/HoldPermissions.ts`:

```ts
import type { Actor } from '../Actor.js';
import type { Hold } from '../entities/Hold.js';

/**
 * The credentials a caller presented, as the domain needs to see them.
 * Structural, so the application layer's AccessContext satisfies it without
 * domain/ importing application/ (ADR-0012). Stack B adds the owner, stack E
 * a hold signature.
 */
export interface HoldCredentials {
  guestSession: { sessionHash: string } | null;
}

/** The guest row: the session that placed the hold. */
function placedBy(hold: Hold, credentials: HoldCredentials): boolean {
  return credentials.guestSession !== null && hold.belongsToSession(credentials.guestSession.sessionHash);
}

/**
 * Who may do what to a hold (holds-lifecycle §1, D7). Each method answers
 * with the role whose credential authorises the command — which the use case
 * records as the event's actor (ADR-0075) — or null when no credential does.
 * Guest credentials are checked before owner ones (stack F adds the owner's
 * release row), so a guest acting on their own hold is recorded as the guest.
 *
 * Permissions only: whether the hold's *state* allows the command (extend
 * at most once, nothing on a closed hold) is the hold's own rule.
 */
export const HoldPermissions = {
  mayExtend(hold: Hold, credentials: HoldCredentials): Actor | null {
    return placedBy(hold, credentials) ? 'guest' : null;
  },
  mayRelease(hold: Hold, credentials: HoldCredentials): Actor | null {
    return placedBy(hold, credentials) ? 'guest' : null;
  },
  mayPurchase(hold: Hold, credentials: HoldCredentials): Actor | null {
    return placedBy(hold, credentials) ? 'guest' : null;
  },
};
```

- [ ] **Step 4: Run the suite**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS. The layer-boundary lint stays clean because `policies/` imports only domain modules.

- [ ] **Step 5: Commit and open PR 3**

```bash
git add apps/api/src/domain/policies
git commit -m "feat(api): HoldPermissions policy with the guest rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
npm run build && npm run test:e2e
git push -u origin feat/holds-a/03-domain-lifecycle
```

Open the PR against `feat/holds-a/02-schema-envelope`.

---

## PR 4 — persistence: the aggregate loads active holds (`feat/holds-a/04-persistence`, base `feat/holds-a/03-domain-lifecycle`)

```bash
git switch -c feat/holds-a/04-persistence feat/holds-a/03-domain-lifecycle
```

### Task 4.1: Availability from hold state — aggregate, ports, adapters, fakes and their contract suites

One change, which no reviewer could approve in halves. `item_state.active_holds` goes. The `Wishlist` carries the list's active holds and decides availability from them. Every port, adapter and fake moves with it, and a contract suite holds both adapter sets to the same behaviour (D8, D9). External behaviour of the HTTP API is unchanged, apart from `status` gaining `'purchased'`.

**Files:**
- Modify: `apps/api/src/domain/entities/Item.ts`, `Item.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, `Wishlist.test.ts`
- Modify: `apps/api/src/application/ports/HoldRepository.ts`, `WishlistRepository.ts`, `ItemRepository.ts`
- Create: `apps/api/src/application/ports/contracts/fixture.ts`, `holdRepository.contract.ts`, `wishlistRepository.contract.ts`
- Rewrite: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`, `InMemoryRepositories.test.ts`
- Create: `apps/api/src/application/test-fakes/InMemoryRepositories.contract.test.ts`
- Modify: `apps/api/src/application/test-fakes/builders.ts`, `builders.test.ts`
- Modify: `apps/api/src/application/use-cases/HoldItem.ts`, `HoldItem.test.ts`, `EnterGuestKey.ts`, `EnterGuestKey.test.ts`, `CreateList.test.ts`
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts`, `db/schema.ts`
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts`, `ItemRepositoryKysely.ts`, `WishlistRepositoryKysely.ts`
- Create: `apps/api/src/infrastructure/contracts.integration.test.ts`
- Rewrite: `apps/api/src/infrastructure/persistence.integration.test.ts`
- Modify: `apps/api/src/infrastructure/db/schema.integration.test.ts` (no `active_holds`)
- Modify: `apps/api/src/presentation/routes.ts`, `compositionRoot.ts`, `openApiDocument.ts`
- Modify: `packages/shared-types/src/listView.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`
- Modify: `docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md` (open item 2)

**Interfaces:**
- Consumes: PR 3's `Hold` (`reconstitute`, `statusAt`, `extend`, `release`, `markPurchased`, `canExtendAt`, `canReleaseAt`), errors and events.
- Produces:
  - **Types:**
    - `type ItemStatus = 'available' | 'held' | 'purchased'` (exported from `Item.ts`)
    - `interface HoldCommandResult<E> { hold: Hold; item: Item; event: E; expectedSeq: number }` (exported from `Wishlist.ts`)
  - **`Item`:**
    - `reconstitute(props: { id; wishlistId; type: string; title; quantity; seq; purchasedCount })`
    - `purchasedCount` getter
    - `availableUnits(activeHolds: number): number`
    - `statusGiven(activeHolds: number): ItemStatus`
    - `placeHold(props: { sessionHash; idempotencyKey; now: Date; durationMs: number }, activeHolds: number, tokens, hasher)`
    - `recordEvent(): number`
    - `recordPurchase(): number`
  - **`Wishlist`:**
    - `reconstitute(props: { …; item?: Item; activeHolds?: readonly Hold[] })`
    - `holdItem(props: { itemId; sessionHash; idempotencyKey; now: Date; durationMs: number }, tokens, hasher): HoldCommandResult<ItemHeldEvent>`
    - `extendHold(hold, now, durationMs): HoldCommandResult<HoldExtendedEvent>`
    - `releaseHold(hold, now): HoldCommandResult<HoldReleasedEvent>`
    - `purchaseHold(hold, now): HoldCommandResult<ItemPurchasedEvent>`
    - `findHold(holdId: string): Hold | null`
    - `owns(hold: Hold): boolean`
    - `canPurchaseHold(hold: Hold, now: Date): boolean`
    - `itemStatusAt(itemId: string, now: Date): ItemStatus`
  - **`WishlistRepository`:**
    - `insert(wishlist)`
    - `findBySlug(slug: string, now: Date)`
    - `findById(id: string, now: Date)`
    - `saveItemState(item: Item): Promise<void>`
  - **`HoldRepository`:**
    - `insert(hold: Hold)`
    - `save(hold: Hold)`
    - `findById(holdId: string): Promise<Hold | null>`
    - `findByIdempotencyKey(itemId: string, key: string): Promise<Hold | null>`
    - `findActiveForWishlist(wishlistId: string, now: Date): Promise<Hold[]>`
    - `findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]>`
  - **Fakes:**
    - `inMemoryPersistence(): { store; wishlists; holds; eventStore; unitOfWork }`
    - every in-memory fake takes an `InMemoryStore` in its constructor
  - **Contract suites:**
    - `describeHoldRepositoryContract(adapter: string, factory: PersistenceFactory)`
    - `describeWishlistRepositoryContract(adapter: string, factory: PersistenceFactory)`
  - **Composition root:** `AppDependencies.clock: Clock`
  - **Shared types:** `itemStatusSchema` gains `'purchased'`

- [ ] **Step 1: Write the failing domain tests**

Replace `apps/api/src/domain/entities/Item.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { Item } from './Item.js';
import { DomainValidationError, ItemUnavailableError } from '../errors.js';

const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const DAY = 86_400_000;
const base = { id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 0, purchasedCount: 0 };

describe('Item.createSingle', () => {
  it('creates a single-type item with quantity 1', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(1);
    expect(item.title).toBe('Stroller');
  });

  it('rejects an empty title', () => {
    expect(() => Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: '  ' })).toThrow(DomainValidationError);
  });

  it('rejects an id that is not a valid UUID', () => {
    expect(() => Item.createSingle({ id: 'i1', wishlistId: WISHLIST_ID, title: 'Stroller' })).toThrow(DomainValidationError);
  });
});

describe('Item availability — from hold state, never a stored counter (D4)', () => {
  it('starts a new item at seq 0 with nothing purchased, and available', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.seq).toBe(0);
    expect(item.purchasedCount).toBe(0);
    expect(item.statusGiven(0)).toBe('available');
  });

  it('restores the persisted seq and purchase count', () => {
    const item = Item.reconstitute({ ...base, seq: 7, purchasedCount: 1 });
    expect(item.seq).toBe(7);
    expect(item.purchasedCount).toBe(1);
  });

  it('has a free unit while active holds plus purchases stay below quantity', () => {
    const item = Item.reconstitute({ ...base, quantity: 3, purchasedCount: 1 });
    expect(item.availableUnits(1)).toBe(1);
    expect(item.statusGiven(1)).toBe('available');
  });

  it('is held once active holds take the last unit', () => {
    const item = Item.reconstitute(base);
    expect(item.availableUnits(1)).toBe(0);
    expect(item.statusGiven(1)).toBe('held');
  });

  it('is purchased once purchases alone cover the quantity', () => {
    expect(Item.reconstitute({ ...base, purchasedCount: 1 }).statusGiven(0)).toBe('purchased');
  });

  it('never reports negative availability when quantity is below what is committed (ADR-0019)', () => {
    expect(Item.reconstitute({ ...base, purchasedCount: 1 }).availableUnits(2)).toBe(0);
  });
});

describe('Item.placeHold', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const GENERATED_HOLD_ID = '55555555-5555-7555-8555-555555555555';
  const GENERATED_SECRET = 'hold-secret';
  const holdProps = { sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1', now, durationMs: 3 * DAY };
  const available = () => Item.reconstitute({ ...base, seq: 4 });
  const fakeTokens = { generateEntityId: () => GENERATED_HOLD_ID, generateHoldSecret: () => GENERATED_SECRET };
  const fakeHasher = { hash: (value: string) => (value === GENERATED_SECRET ? 'f'.repeat(64) : 'e'.repeat(64)) };

  it('mints a hold on this item that expires one duration from now', () => {
    const { hold } = available().placeHold(holdProps, 0, fakeTokens, fakeHasher);
    expect(hold.id.value).toBe(GENERATED_HOLD_ID);
    expect(hold.secret.value).toBe(GENERATED_SECRET);
    expect(hold.itemId.value).toBe(ITEM_ID);
    expect(hold.expiresAt).toEqual(new Date(now.getTime() + 3 * DAY));
  });

  it('returns the seq the caller must append against, and advances past it', () => {
    const item = available();
    expect(item.placeHold(holdProps, 0, fakeTokens, fakeHasher).expectedSeq).toBe(4);
    expect(item.seq).toBe(5);
  });

  it('emits an ItemHeld event carrying the hashed secret, not the raw one', () => {
    const { event } = available().placeHold(holdProps, 0, fakeTokens, fakeHasher);
    expect(event).toEqual({
      type: 'ItemHeld', v: 1, itemId: ITEM_ID, holdId: GENERATED_HOLD_ID, secretHash: 'f'.repeat(64),
      sessionHash: holdProps.sessionHash, idempotencyKey: 'idem-1',
      expiresAt: new Date(now.getTime() + 3 * DAY).toISOString(), occurredAt: now.toISOString(),
    });
    expect(event).not.toHaveProperty('secret');
  });

  it('throws ItemUnavailableError when active holds cover the quantity, without advancing seq', () => {
    const item = available();
    expect(() => item.placeHold(holdProps, 1, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
    expect(item.seq).toBe(4);
  });

  it('throws ItemUnavailableError when purchases cover the quantity', () => {
    const item = Item.reconstitute({ ...base, purchasedCount: 1 });
    expect(() => item.placeHold(holdProps, 0, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
  });

  it('rejects a duration that does not put the expiry in the future', () => {
    expect(() => available().placeHold({ ...holdProps, durationMs: 0 }, 0, fakeTokens, fakeHasher)).toThrow(DomainValidationError);
  });
});

describe('Item.recordEvent and recordPurchase', () => {
  it('recordEvent returns the seq before the event and advances by one', () => {
    const item = Item.reconstitute({ ...base, seq: 2 });
    expect(item.recordEvent()).toBe(2);
    expect(item.seq).toBe(3);
  });

  it('recordPurchase counts the unit as gone for good and records one event', () => {
    const item = Item.reconstitute({ ...base, seq: 2 });
    expect(item.recordPurchase()).toBe(2);
    expect(item.purchasedCount).toBe(1);
    expect(item.seq).toBe(3);
  });
});

describe('Item.reconstitute', () => {
  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Item.reconstitute({ ...base, title: '' })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
  });

  it('rejects a whitespace-only title, not just an empty one', () => {
    expect(() => Item.reconstitute({ ...base, title: '   ' })).toThrow(DomainValidationError);
  });

  it('passes through the persisted type and quantity', () => {
    const item = Item.reconstitute({ ...base, quantity: 3 });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(3);
  });

  it('rejects a non-positive or fractional quantity', () => {
    expect(() => Item.reconstitute({ ...base, quantity: 0 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, quantity: -1 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, quantity: 1.5 })).toThrow(DomainValidationError);
  });

  it('rejects a type other than single', () => {
    expect(() => Item.reconstitute({ ...base, type: 'bundle' })).toThrow(DomainValidationError);
  });

  it('rejects a negative or fractional seq', () => {
    expect(() => Item.reconstitute({ ...base, seq: -5 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, seq: 1.5 })).toThrow(DomainValidationError);
  });

  it('rejects a negative or fractional purchasedCount', () => {
    expect(() => Item.reconstitute({ ...base, purchasedCount: -1 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, purchasedCount: 0.5 })).toThrow(DomainValidationError);
  });
});
```

Replace `apps/api/src/domain/entities/Wishlist.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { Wishlist } from './Wishlist.js';
import { Item } from './Item.js';
import { Hold } from './Hold.js';
import {
  DomainValidationError, HoldNotActiveError, HoldNotFoundError, ItemNotFoundError, ItemUnavailableError,
} from '../errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const OTHER_WISHLIST_ID = '99999999-9999-7999-8999-999999999999';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const OTHER_ITEM_ID = '44444444-4444-7444-8444-444444444444';
const SESSION = 'a'.repeat(64);
const OTHER_SESSION = 'b'.repeat(64);
const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const validProps = { id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };
const tokens = (holdId = '55555555-5555-7555-8555-555555555555') => ({ generateEntityId: () => holdId, generateHoldSecret: () => 'hold-secret' });
const hasher = { hash: () => 'f'.repeat(64) };

function itemOf(wishlistId = WISHLIST_ID, overrides: { quantity?: number; seq?: number; purchasedCount?: number } = {}) {
  return Item.reconstitute({ id: ITEM_ID, wishlistId, type: 'single', title: 'Cot', quantity: 1, seq: 0, purchasedCount: 0, ...overrides });
}

let holdCount = 0;
function holdOn(itemId: string, overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}): Hold {
  holdCount += 1;
  return Hold.reconstitute({
    id: `00000000-0000-7000-8000-${String(holdCount).padStart(12, '0')}`, itemId, secret: 'hold-secret', sessionHash: SESSION,
    idempotencyKey: `idem-${holdCount}`, expiresAt: at(3 * DAY), extendedAt: null, releasedAt: null, purchasedAt: null,
    ...overrides,
  });
}

function loaded(options: { quantity?: number; seq?: number; purchasedCount?: number; activeHolds?: Hold[] } = {}): Wishlist {
  const { activeHolds = [], ...itemOverrides } = options;
  return Wishlist.reconstitute({ ...validProps, keyGen: 1, item: itemOf(WISHLIST_ID, itemOverrides), activeHolds });
}

describe('Wishlist.create', () => {
  it('creates a wishlist with keyGen starting at 1', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.id.value).toBe(WISHLIST_ID);
    expect(wishlist.slug.value).toBe('abc123');
    expect(wishlist.title).toBe('Baby Shower');
    expect(wishlist.keyGen).toBe(1);
  });

  it('wraps the bearer secrets in value objects', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.ownerToken.value).toBe('owner-tok');
    expect(wishlist.key.value).toBe('guest-key');
  });

  it('trims the title', () => {
    expect(Wishlist.create({ ...validProps, title: '  Baby Shower  ' }).title).toBe('Baby Shower');
  });

  it('rejects an empty or over-long title, an empty secret, or a bad id', () => {
    expect(() => Wishlist.create({ ...validProps, title: '   ' })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, ownerToken: '' })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, key: '' })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, id: 'w1' })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.reconstitute', () => {
  const persisted = { ...validProps, keyGen: 3 };

  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, title: '' })).toThrow(DomainValidationError);
    expect(() => Wishlist.reconstitute({ ...persisted, title: '   ' })).toThrow(DomainValidationError);
  });

  it('restores the persisted fields as value objects', () => {
    const wishlist = Wishlist.reconstitute(persisted);
    expect(wishlist.keyGen).toBe(3);
    expect(wishlist.ownerToken.value).toBe('owner-tok');
  });

  it('has no item when none was loaded', () => {
    expect(Wishlist.reconstitute(persisted).item).toBeNull();
  });

  it('attaches the loaded item, concurrency state and all', () => {
    const item = itemOf(WISHLIST_ID, { seq: 7 });
    const wishlist = Wishlist.reconstitute({ ...persisted, item });
    expect(wishlist.item).toBe(item);
    expect(wishlist.item?.seq).toBe(7);
  });

  it('rejects an item that belongs to a different wishlist', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, item: itemOf(OTHER_WISHLIST_ID) })).toThrow(DomainValidationError);
  });

  it('carries the loaded active holds, each reachable by id', () => {
    const hold = holdOn(ITEM_ID);
    expect(loaded({ activeHolds: [hold] }).findHold(hold.id.value)).toBe(hold);
  });

  it('rejects a hold on an item outside this wishlist', () => {
    expect(() => loaded({ activeHolds: [holdOn(OTHER_ITEM_ID)] })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.addItem', () => {
  it('attaches an available item it minted the id for, owned by this wishlist', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateEntityId: () => ITEM_ID });
    expect(wishlist.item).toBe(item);
    expect(item.id.value).toBe(ITEM_ID);
    expect(item.wishlistId.value).toBe(WISHLIST_ID);
    expect(wishlist.itemStatusAt(ITEM_ID, T0)).toBe('available');
  });

  it('throws when a second item is added — single-item lists until stack B', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem({ title: 'Cot' }, { generateEntityId: () => ITEM_ID });
    expect(() => wishlist.addItem({ title: 'Pram' }, { generateEntityId: () => OTHER_ITEM_ID })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.getItem', () => {
  it('returns the attached item when the id matches', () => {
    const wishlist = loaded();
    expect(wishlist.getItem(ITEM_ID)).toBe(wishlist.item);
  });

  it('throws ItemNotFoundError when no item is attached, or the id does not match', () => {
    expect(() => Wishlist.create(validProps).getItem(ITEM_ID)).toThrow(ItemNotFoundError);
    expect(() => loaded().getItem(OTHER_ITEM_ID)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.holdItem', () => {
  const props = { itemId: ITEM_ID, sessionHash: SESSION, idempotencyKey: 'idem-new', now: T0, durationMs: 3 * DAY };

  it('places a hold on a free item and returns everything the caller must persist', () => {
    const wishlist = loaded({ seq: 4 });
    const { hold, item, event, expectedSeq } = wishlist.holdItem(props, tokens(), hasher);
    expect(hold.expiresAt).toEqual(at(3 * DAY));
    expect(item).toBe(wishlist.getItem(ITEM_ID));
    expect(event.type).toBe('ItemHeld');
    expect(expectedSeq).toBe(4);
    expect(item.seq).toBe(5);
  });

  it('adds the hold to its snapshot, so the same aggregate refuses another hold on the last unit', () => {
    const wishlist = loaded();
    wishlist.holdItem(props, tokens(), hasher);
    expect(wishlist.itemStatusAt(ITEM_ID, T0)).toBe('held');
    expect(() => wishlist.holdItem({ ...props, sessionHash: OTHER_SESSION, idempotencyKey: 'idem-2' }, tokens('66666666-6666-7666-8666-666666666666'), hasher))
      .toThrow(ItemUnavailableError);
  });

  it('refuses when a loaded active hold covers the unit', () => {
    expect(() => loaded({ activeHolds: [holdOn(ITEM_ID)] }).holdItem(props, tokens(), hasher)).toThrow(ItemUnavailableError);
  });

  it('re-checks each loaded hold at now: one that lapsed since loading frees its unit (D8)', () => {
    const lapsed = holdOn(ITEM_ID, { expiresAt: at(-1) });
    expect(() => loaded({ activeHolds: [lapsed] }).holdItem(props, tokens(), hasher)).not.toThrow();
  });

  it('throws ItemNotFoundError for an item not on this list', () => {
    expect(() => loaded().holdItem({ ...props, itemId: OTHER_ITEM_ID }, tokens(), hasher)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.findHold and owns', () => {
  it('findHold returns the snapshot instance itself, or null', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ activeHolds: [hold] });
    expect(wishlist.findHold(hold.id.value)).toBe(hold);
    expect(wishlist.findHold('00000000-0000-7000-8000-999999999999')).toBeNull();
  });

  it("owns a hold on its own item, not one on another list's item", () => {
    expect(loaded().owns(holdOn(ITEM_ID))).toBe(true);
    expect(loaded().owns(holdOn(OTHER_ITEM_ID))).toBe(false);
  });
});

describe('Wishlist.extendHold and releaseHold', () => {
  it('extendHold extends the hold and records one event on the item stream', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ seq: 1, activeHolds: [hold] });
    const { event, item, expectedSeq } = wishlist.extendHold(hold, at(DAY), 3 * DAY);
    expect(event.type).toBe('HoldExtended');
    expect(expectedSeq).toBe(1);
    expect(item.seq).toBe(2);
    expect(hold.expiresAt).toEqual(at(6 * DAY));
  });

  it('releaseHold frees the unit within the same aggregate', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ activeHolds: [hold] });
    wishlist.releaseHold(hold, at(DAY));
    expect(wishlist.itemStatusAt(ITEM_ID, at(DAY))).toBe('available');
  });

  it("refuses a hold on another list's item with HoldNotFoundError", () => {
    expect(() => loaded().releaseHold(holdOn(OTHER_ITEM_ID), T0)).toThrow(HoldNotFoundError);
    expect(() => loaded().extendHold(holdOn(OTHER_ITEM_ID), T0, DAY)).toThrow(HoldNotFoundError);
  });

  it('does not advance seq when the hold refuses the command', () => {
    const wishlist = loaded();
    expect(() => wishlist.extendHold(holdOn(ITEM_ID, { releasedAt: T0 }), T0, DAY)).toThrow(HoldNotActiveError);
    expect(wishlist.getItem(ITEM_ID).seq).toBe(0);
  });
});

describe('Wishlist.purchaseHold (D15)', () => {
  it('purchases an active hold; the unit is gone for good', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ activeHolds: [hold] });
    const { event, item } = wishlist.purchaseHold(hold, at(DAY));
    expect(event.type).toBe('ItemPurchased');
    expect(item.purchasedCount).toBe(1);
    expect(wishlist.itemStatusAt(ITEM_ID, at(DAY))).toBe('purchased');
  });

  it('purchases an expired hold while a unit is still free', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    expect(loaded().purchaseHold(expired, T0).event.type).toBe('ItemPurchased');
  });

  it('refuses an expired hold once someone else holds the last unit, and records nothing', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ activeHolds: [holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(() => wishlist.purchaseHold(expired, T0)).toThrow(ItemUnavailableError);
    expect(expired.purchasedAt).toBeNull();
    expect(wishlist.getItem(ITEM_ID).seq).toBe(0);
  });

  it('refuses a released hold', () => {
    expect(() => loaded().purchaseHold(holdOn(ITEM_ID, { releasedAt: T0 }), T0)).toThrow(HoldNotActiveError);
  });
});

describe('Wishlist.canPurchaseHold', () => {
  it('is true for an active hold, and for an expired one while a unit is free', () => {
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID), T0)).toBe(true);
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { expiresAt: at(-1) }), T0)).toBe(true);
  });

  it('is false for an expired hold whose unit someone else now holds', () => {
    const wishlist = loaded({ activeHolds: [holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(wishlist.canPurchaseHold(holdOn(ITEM_ID, { expiresAt: at(-1) }), T0)).toBe(false);
  });

  it("is false for a released or purchased hold, or another list's", () => {
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { releasedAt: T0 }), T0)).toBe(false);
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { purchasedAt: T0 }), T0)).toBe(false);
    expect(loaded().canPurchaseHold(holdOn(OTHER_ITEM_ID), T0)).toBe(false);
  });
});

describe('Wishlist.itemStatusAt — lazy expiry', () => {
  it('is held up to and including the instant the hold expires, available 1 ms later', () => {
    const wishlist = loaded({ activeHolds: [holdOn(ITEM_ID)] });
    expect(wishlist.itemStatusAt(ITEM_ID, at(3 * DAY))).toBe('held');
    expect(wishlist.itemStatusAt(ITEM_ID, at(3 * DAY + 1))).toBe('available');
  });

  it('is purchased once purchases cover the quantity', () => {
    expect(loaded({ purchasedCount: 1 }).itemStatusAt(ITEM_ID, T0)).toBe('purchased');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test --workspace=apps/api -- src/domain`
Expected: FAIL. `purchasedCount` is not accepted, and `availableUnits`, `holdItem`, `itemStatusAt` and the rest are not functions.

- [ ] **Step 3: Implement `Item`**

Replace `apps/api/src/domain/entities/Item.ts` with:

```ts
import { DomainValidationError, ItemUnavailableError } from '../errors.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import { Hold } from './Hold.js';
import { UuidId } from '../value-objects/UuidId.js';

export type ItemStatus = 'available' | 'held' | 'purchased';

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export class Item {
  /**
   * Enforces the entity's invariants, so no construction path — factory or
   * reconstitution from persisted rows — can produce an invalid Item. Titles
   * are validated for blankness against their trimmed content, but the
   * stored value is not itself normalized here: normalization (trimming)
   * belongs to the factories, which clean what a caller supplied, whereas
   * these checks state what an Item *is*.
   */
  private constructor(
    readonly id: UuidId,
    readonly wishlistId: UuidId,
    readonly type: 'single',
    readonly title: string,
    readonly quantity: number,
    private _seq: number,
    private _purchasedCount: number,
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
    if (type !== 'single') throw new DomainValidationError('Item type must be "single"; this slice supports no other variant');
    if (!Number.isInteger(quantity) || quantity < 1) throw new DomainValidationError('Item quantity must be a positive integer');
    if (!isNonNegativeInteger(_seq)) throw new DomainValidationError('Item seq must be a non-negative integer');
    if (!isNonNegativeInteger(_purchasedCount)) throw new DomainValidationError('Item purchasedCount must be a non-negative integer');
  }

  static createSingle(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(UuidId.from(props.id), UuidId.from(props.wishlistId), 'single', props.title.trim(), 1, 0, 0);
  }

  /**
   * Reconstructs an Item from persisted fields. `type` stays a `string` so
   * infrastructure can pass `row.type` straight through; the constructor
   * rejects anything but 'single', so the cast below weakens nothing.
   */
  static reconstitute(props: {
    id: string; wishlistId: string; type: string; title: string; quantity: number; seq: number; purchasedCount: number;
  }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), props.type as 'single',
      props.title, props.quantity, props.seq, props.purchasedCount,
    );
  }

  /**
   * The seq this item's stream is at, from `item_state.seq`. Appends must
   * use the value `recordEvent` hands back for the store's optimistic check
   * (ADR-0010) to accept them.
   */
  get seq(): number {
    return this._seq;
  }

  /** Units bought. Purchase is terminal, so this only grows — safe to store, unlike an active-hold count (D4). */
  get purchasedCount(): number {
    return this._purchasedCount;
  }

  /**
   * Units no one holds or has bought, given how many holds on this item are
   * active right now. The count comes from the caller — the Wishlist, which
   * carries the list's active holds — because liveness belongs to hold rows,
   * never to a counter here (D4). Never negative: quantity may drop below
   * what is already committed (ADR-0019).
   */
  availableUnits(activeHolds: number): number {
    return Math.max(0, this.quantity - activeHolds - this._purchasedCount);
  }

  statusGiven(activeHolds: number): ItemStatus {
    if (this.availableUnits(activeHolds) > 0) return 'available';
    return this._purchasedCount >= this.quantity ? 'purchased' : 'held';
  }

  /**
   * Decides whether a unit is free, mints the Hold — its id and secret
   * belong to a hold that does not exist yet, so they are not the caller's
   * to supply — and the event recording it, then advances this item's
   * stream. Reach it through `Wishlist.holdItem`, which supplies
   * `activeHolds` and authorizes the caller.
   *
   * Collaborators are structural types: domain/ may not import
   * application/ (ADR-0012), and the application layer's TokenGenerator and
   * Hasher already satisfy these shapes.
   */
  placeHold(
    props: { sessionHash: string; idempotencyKey: string; now: Date; durationMs: number },
    activeHolds: number,
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): { hold: Hold; event: ItemHeldEvent; expectedSeq: number } {
    if (this.availableUnits(activeHolds) === 0) throw new ItemUnavailableError(this.id.value);

    const hold = Hold.create({
      id: tokens.generateEntityId(),
      itemId: this.id.value,
      secret: tokens.generateHoldSecret(),
      sessionHash: props.sessionHash,
      idempotencyKey: props.idempotencyKey,
      expiresAt: new Date(props.now.getTime() + props.durationMs),
      now: props.now,
    });
    const event: ItemHeldEvent = {
      type: 'ItemHeld',
      v: 1,
      itemId: hold.itemId.value,
      holdId: hold.id.value,
      secretHash: hasher.hash(hold.secret.value),
      sessionHash: hold.sessionHash.value,
      idempotencyKey: hold.idempotencyKey.value,
      expiresAt: hold.expiresAt.toISOString(),
      occurredAt: props.now.toISOString(),
    };
    return { hold, event, expectedSeq: this.recordEvent() };
  }

  /**
   * Advances the stream by one event and returns the seq it was at — the
   * value to append against. Every command on a hold of this item records
   * through here, since they all share the item's stream (ADR-0008).
   */
  recordEvent(): number {
    const expectedSeq = this._seq;
    this._seq += 1;
    return expectedSeq;
  }

  /** One more unit gone for good, recorded as one more event. */
  recordPurchase(): number {
    this._purchasedCount += 1;
    return this.recordEvent();
  }
}
```

- [ ] **Step 4: Implement `Wishlist`**

Replace `apps/api/src/domain/entities/Wishlist.ts` with:

```ts
import { DomainValidationError, HoldNotFoundError, ItemNotFoundError, ItemUnavailableError } from '../errors.js';
import type { HoldExtendedEvent } from '../events/HoldExtendedEvent.js';
import type { HoldReleasedEvent } from '../events/HoldReleasedEvent.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import type { ItemPurchasedEvent } from '../events/ItemPurchasedEvent.js';
import { GuestKey } from '../value-objects/GuestKey.js';
import { OwnerToken } from '../value-objects/OwnerToken.js';
import { Slug } from '../value-objects/Slug.js';
import { UuidId } from '../value-objects/UuidId.js';
import type { Hold } from './Hold.js';
import { Item, type ItemStatus } from './Item.js';

/** What a hold command leaves for the use case to persist: the hold, the item whose state moved, and the event to append at `expectedSeq`. */
export interface HoldCommandResult<E> {
  hold: Hold;
  item: Item;
  event: E;
  expectedSeq: number;
}

/**
 * Aggregate root (ADR-0078). Items are reachable only through it, and it
 * carries the list's *active* holds as of the instant it was loaded
 * (holds-lifecycle D8), so every rule that needs to see other holds —
 * availability today, the session cap in stack C — is decided here. Holds
 * are their own aggregate: the wishlist authorizes and decides commands on
 * them; the use case persists the outcome.
 */
export class Wishlist {
  private _item: Item | null = null;
  private _activeHolds: Hold[] = [];

  /**
   * Enforces the aggregate's own invariants, so neither `create` nor
   * `reconstitute` can produce an invalid Wishlist. Blankness is checked
   * against the title's trimmed content; trimming itself stays in `create`,
   * where the untrusted caller input arrives.
   */
  private constructor(
    readonly id: UuidId,
    readonly slug: Slug,
    readonly title: string,
    readonly ownerToken: OwnerToken,
    readonly key: GuestKey,
    readonly keyGen: number,
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
  }

  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string }): Wishlist {
    return new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title.trim(),
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), 1,
    );
  }

  /**
   * Reconstructs a Wishlist from persisted fields — used by repositories,
   * not by creation flows. `activeHolds` are the list's holds active at load
   * time; each must be on one of this wishlist's items.
   */
  static reconstitute(props: {
    id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number;
    item?: Item; activeHolds?: readonly Hold[];
  }): Wishlist {
    if (props.item && props.item.wishlistId.value !== props.id) {
      throw new DomainValidationError('Item belongs to a different wishlist');
    }
    const holds = props.activeHolds ?? [];
    for (const hold of holds) {
      if (!props.item || hold.itemId.value !== props.item.id.value) {
        throw new DomainValidationError('Hold belongs to an item outside this wishlist');
      }
    }
    const wishlist = new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title,
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), props.keyGen,
    );
    wishlist._item = props.item ?? null;
    wishlist._activeHolds = [...holds];
    return wishlist;
  }

  /**
   * Creates and attaches this wishlist's item, minting its id via the
   * supplied generator (a structural type: domain/ may not import
   * application/, ADR-0012).
   */
  addItem(props: { title: string }, ids: { generateEntityId(): string }): Item {
    if (this._item !== null) {
      throw new DomainValidationError('Wishlist already has an item; this slice supports a single item per wishlist');
    }
    this._item = Item.createSingle({ id: ids.generateEntityId(), wishlistId: this.id.value, title: props.title });
    return this._item;
  }

  get item(): Item | null {
    return this._item;
  }

  /**
   * Resolves `itemId` to the Item this wishlist owns, or throws
   * ItemNotFoundError — the aggregate's authorization step for items.
   */
  getItem(itemId: string): Item {
    if (this._item === null || this._item.id.value !== itemId) {
      throw new ItemNotFoundError(itemId);
    }
    return this._item;
  }

  /** The loaded instance of an active hold, or null — a hold not in the snapshot is expired or closed (D8). */
  findHold(holdId: string): Hold | null {
    return this._activeHolds.find((hold) => hold.id.value === holdId) ?? null;
  }

  /** Whether `hold` is on one of this wishlist's items: the authorization step for a hold loaded by id, as `getItem` is for items. */
  owns(hold: Hold): boolean {
    return this._item !== null && hold.itemId.value === this._item.id.value;
  }

  itemStatusAt(itemId: string, now: Date): ItemStatus {
    const item = this.getItem(itemId);
    return item.statusGiven(this.activeHoldsOn(item, now));
  }

  holdItem(
    props: { itemId: string; sessionHash: string; idempotencyKey: string; now: Date; durationMs: number },
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): HoldCommandResult<ItemHeldEvent> {
    const item = this.getItem(props.itemId);
    const { hold, event, expectedSeq } = item.placeHold(props, this.activeHoldsOn(item, props.now), tokens, hasher);
    this._activeHolds.push(hold);
    return { hold, item, event, expectedSeq };
  }

  extendHold(hold: Hold, now: Date, durationMs: number): HoldCommandResult<HoldExtendedEvent> {
    const item = this.itemOf(hold);
    const event = hold.extend(now, durationMs);
    return { hold, item, event, expectedSeq: item.recordEvent() };
  }

  releaseHold(hold: Hold, now: Date): HoldCommandResult<HoldReleasedEvent> {
    const item = this.itemOf(hold);
    const event = hold.release(now);
    return { hold, item, event, expectedSeq: item.recordEvent() };
  }

  /**
   * An active hold may always be purchased — its unit is already its own.
   * An expired one may be too, so a guest who bought the gift after their
   * hold lapsed need not re-hold it (D15) — but only while a unit is still
   * free, or they would be buying one someone else now holds.
   */
  purchaseHold(hold: Hold, now: Date): HoldCommandResult<ItemPurchasedEvent> {
    const item = this.itemOf(hold);
    if (hold.statusAt(now) === 'expired' && item.availableUnits(this.activeHoldsOn(item, now)) === 0) {
      throw new ItemUnavailableError(item.id.value);
    }
    const event = hold.markPurchased(now);
    return { hold, item, event, expectedSeq: item.recordPurchase() };
  }

  /** `purchaseHold`'s rule as a question, for views that offer the action only when it would succeed. */
  canPurchaseHold(hold: Hold, now: Date): boolean {
    if (!this.owns(hold)) return false;
    const status = hold.statusAt(now);
    if (status === 'active') return true;
    if (status !== 'expired') return false;
    const item = this.itemOf(hold);
    return item.availableUnits(this.activeHoldsOn(item, now)) > 0;
  }

  /**
   * Re-checked at `now` rather than trusted from the load: the repository
   * returned holds active when it ran (D8), and only `statusAt` defines
   * active.
   */
  private activeHoldsOn(item: Item, now: Date): number {
    return this._activeHolds.filter((hold) => hold.itemId.value === item.id.value && hold.statusAt(now) === 'active').length;
  }

  private itemOf(hold: Hold): Item {
    if (!this.owns(hold)) throw new HoldNotFoundError(hold.id.value);
    return this._item as Item;
  }
}
```

- [ ] **Step 5: Run the domain tests**

Run: `npm run test --workspace=apps/api -- src/domain`
Expected: PASS. The rest of the workspace does not compile yet; the next steps fix that.

- [ ] **Step 6: Write the port contract suites (they fail until Step 9)**

Create `apps/api/src/application/ports/contracts/fixture.ts`:

```ts
import { Hold } from '../../../domain/entities/Hold.js';
import { Wishlist } from '../../../domain/entities/Wishlist.js';
import type { Actor } from '../../../domain/Actor.js';
import type { LedgerEvent } from '../../../domain/events/LedgerEvent.js';
import type { EventStore } from '../EventStore.js';
import type { HoldRepository } from '../HoldRepository.js';
import type { WishlistRepository } from '../WishlistRepository.js';

/**
 * One adapter set under test, fresh per test. Every port contract suite
 * (holds-lifecycle D9) runs against both the in-memory fakes and the Kysely
 * adapters through this, so the fakes every use-case test relies on are held
 * to the same behaviour as the real thing.
 */
export interface PersistenceFixture {
  wishlists: WishlistRepository;
  holds: HoldRepository;
  eventStore: EventStore;
  /** The rows a stream holds, read behind the port: `append` returns nothing, so this is how a suite sees what it wrote. */
  recordedEvents(itemId: string): Promise<{ type: string; actor: Actor; payload: LedgerEvent }[]>;
  dispose(): Promise<void>;
}

export type PersistenceFactory = () => Promise<PersistenceFixture>;

export const LIST_A = '11111111-1111-7111-8111-111111111111';
export const LIST_B = '22222222-2222-7222-8222-222222222222';
export const ITEM_A = '33333333-3333-7333-8333-333333333333';
export const ITEM_B = '44444444-4444-7444-8444-444444444444';
export const SESSION = 'a'.repeat(64);
export const OTHER_SESSION = 'b'.repeat(64);
export const NOW = new Date('2026-03-01T12:00:00.000Z');
export const later = (ms: number) => new Date(NOW.getTime() + ms);

/** Two one-item lists, A and B, so every suite can check an adapter never answers for the wrong list. */
export async function seedTwoLists(wishlists: WishlistRepository): Promise<void> {
  const a = Wishlist.create({ id: LIST_A, slug: 'list-a', title: 'List A', ownerToken: 'owner-a', key: 'key-a' });
  a.addItem({ title: 'Cot' }, { generateEntityId: () => ITEM_A });
  const b = Wishlist.create({ id: LIST_B, slug: 'list-b', title: 'List B', ownerToken: 'owner-b', key: 'key-b' });
  b.addItem({ title: 'Pram' }, { generateEntityId: () => ITEM_B });
  await wishlists.insert(a);
  await wishlists.insert(b);
}

let holdCount = 0;
/**
 * A hold in persisted shape, active on item A for the session by default.
 * Built with `reconstitute`, so a fixture can sit at any point of its life,
 * already expired included.
 */
export function holdFixture(overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}): Hold {
  holdCount += 1;
  const n = String(holdCount).padStart(12, '0');
  return Hold.reconstitute({
    id: `00000000-0000-7000-8000-${n}`, itemId: ITEM_A, secret: `secret-${n}`, sessionHash: SESSION,
    idempotencyKey: `idem-${n}`, expiresAt: later(60_000), extendedAt: null, releasedAt: null, purchasedAt: null,
    ...overrides,
  });
}
```

Create `apps/api/src/application/ports/contracts/holdRepository.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ITEM_A, ITEM_B, LIST_A, LIST_B, NOW, OTHER_SESSION, SESSION,
  holdFixture, later, seedTwoLists, type PersistenceFactory, type PersistenceFixture,
} from './fixture.js';

export function describeHoldRepositoryContract(adapter: string, factory: PersistenceFactory): void {
  describe(`HoldRepository contract (${adapter})`, () => {
    let fx: PersistenceFixture;
    beforeEach(async () => { fx = await factory(); await seedTwoLists(fx.wishlists); });
    afterEach(async () => { await fx.dispose(); });

    it('round-trips a hold through insert and findById, lifecycle timestamps included', async () => {
      const hold = holdFixture({ extendedAt: later(-5_000), releasedAt: later(-1_000) });
      await fx.holds.insert(hold);
      expect(await fx.holds.findById(hold.id.value)).toEqual(hold);
    });

    it('returns null for an unknown or malformed id', async () => {
      expect(await fx.holds.findById('00000000-0000-7000-8000-999999999999')).toBeNull();
      expect(await fx.holds.findById('not-a-uuid')).toBeNull();
    });

    it('finds a hold by item and idempotency key, and only on that item', async () => {
      const hold = holdFixture({ idempotencyKey: 'tap-1' });
      await fx.holds.insert(hold);
      expect(await fx.holds.findByIdempotencyKey(ITEM_A, 'tap-1')).toEqual(hold);
      expect(await fx.holds.findByIdempotencyKey(ITEM_B, 'tap-1')).toBeNull();
    });

    it('refuses a second hold with the same item and idempotency key (ADR-0048)', async () => {
      await fx.holds.insert(holdFixture({ idempotencyKey: 'same' }));
      await expect(fx.holds.insert(holdFixture({ idempotencyKey: 'same' }))).rejects.toThrow();
    });

    it('save writes the lifecycle exactly as the domain left it', async () => {
      const hold = holdFixture();
      await fx.holds.insert(hold);
      hold.extend(NOW, 3_600_000);
      hold.markPurchased(later(1));

      await fx.holds.save(hold);

      expect(await fx.holds.findById(hold.id.value)).toEqual(hold);
    });

    describe('findActiveForWishlist — the D8 boundary', () => {
      it.each([
        ['expired 1 ms ago', { expiresAt: later(-1) }, false],
        ['expiring at this very instant', { expiresAt: NOW }, true],
        ['expiring 1 ms from now', { expiresAt: later(1) }, true],
        ['released', { releasedAt: later(-10) }, false],
        ['purchased', { purchasedAt: later(-10) }, false],
      ] as const)('a hold %s is returned: %s', async (_name, overrides, returned) => {
        const hold = holdFixture(overrides);
        await fx.holds.insert(hold);

        const found = await fx.holds.findActiveForWishlist(LIST_A, NOW);

        expect(found.map((h) => h.id.value)).toEqual(returned ? [hold.id.value] : []);
      });

      it("never returns another list's holds", async () => {
        await fx.holds.insert(holdFixture({ itemId: ITEM_B }));
        expect(await fx.holds.findActiveForWishlist(LIST_A, NOW)).toEqual([]);
      });

      it('agrees with Hold.statusAt for every hold it returns', async () => {
        for (const overrides of [{}, { expiresAt: later(-1) }, { releasedAt: later(-1) }, { expiresAt: NOW }]) {
          await fx.holds.insert(holdFixture(overrides));
        }
        const found = await fx.holds.findActiveForWishlist(LIST_A, NOW);
        expect(found).toHaveLength(2);
        expect(found.every((h) => h.statusAt(NOW) === 'active')).toBe(true);
      });
    });

    describe('findForSession', () => {
      it('returns every hold the session placed on the list, whatever its state', async () => {
        const holds = [holdFixture(), holdFixture({ expiresAt: later(-1) }), holdFixture({ releasedAt: later(-1) }), holdFixture({ purchasedAt: later(-1) })];
        for (const hold of holds) await fx.holds.insert(hold);

        const found = await fx.holds.findForSession(LIST_A, SESSION);

        expect(found.map((h) => h.id.value).sort()).toEqual(holds.map((h) => h.id.value).sort());
      });

      it("leaves out other sessions' holds and other lists' holds", async () => {
        await fx.holds.insert(holdFixture({ sessionHash: OTHER_SESSION }));
        await fx.holds.insert(holdFixture({ itemId: ITEM_B }));
        expect(await fx.holds.findForSession(LIST_A, SESSION)).toEqual([]);
        expect(await fx.holds.findForSession(LIST_B, OTHER_SESSION)).toEqual([]);
      });
    });
  });
}
```

Create `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Item } from '../../../domain/entities/Item.js';
import { ItemNotFoundError } from '../../../domain/errors.js';
import {
  ITEM_A, ITEM_B, LIST_A, LIST_B, NOW,
  holdFixture, later, seedTwoLists, type PersistenceFactory, type PersistenceFixture,
} from './fixture.js';

export function describeWishlistRepositoryContract(adapter: string, factory: PersistenceFactory): void {
  describe(`WishlistRepository contract (${adapter})`, () => {
    let fx: PersistenceFixture;
    beforeEach(async () => { fx = await factory(); await seedTwoLists(fx.wishlists); });
    afterEach(async () => { await fx.dispose(); });

    it('loads the whole aggregate by slug and by id, item included', async () => {
      for (const loaded of [await fx.wishlists.findBySlug('list-a', NOW), await fx.wishlists.findById(LIST_A, NOW)]) {
        expect(loaded?.id.value).toBe(LIST_A);
        expect(loaded?.title).toBe('List A');
        expect(loaded?.item?.id.value).toBe(ITEM_A);
        expect(loaded?.item?.seq).toBe(0);
        expect(loaded?.item?.purchasedCount).toBe(0);
      }
    });

    it('returns null for an unknown slug or id', async () => {
      expect(await fx.wishlists.findBySlug('no-such-list', NOW)).toBeNull();
      expect(await fx.wishlists.findById('00000000-0000-7000-8000-999999999999', NOW)).toBeNull();
    });

    it("loads the list's holds active at now, and no others (D8)", async () => {
      const active = holdFixture();
      const expired = holdFixture({ expiresAt: later(-1) });
      const released = holdFixture({ releasedAt: later(-5) });
      const elsewhere = holdFixture({ itemId: ITEM_B });
      for (const hold of [active, expired, released, elsewhere]) await fx.holds.insert(hold);

      const loaded = await fx.wishlists.findById(LIST_A, NOW);

      expect(loaded?.findHold(active.id.value)?.id.value).toBe(active.id.value);
      expect(loaded?.findHold(expired.id.value)).toBeNull();
      expect(loaded?.findHold(released.id.value)).toBeNull();
      expect(loaded?.findHold(elsewhere.id.value)).toBeNull();
    });

    it('decides availability from what it loaded: held until the hold lapses, then available', async () => {
      await fx.holds.insert(holdFixture({ expiresAt: later(60_000) }));

      const atExpiry = await fx.wishlists.findById(LIST_A, later(60_000));
      const justAfter = await fx.wishlists.findById(LIST_A, later(60_001));

      expect(atExpiry?.itemStatusAt(ITEM_A, later(60_000))).toBe('held');
      expect(justAfter?.itemStatusAt(ITEM_A, later(60_001))).toBe('available');
    });

    it('saveItemState writes seq and purchasedCount exactly as the domain left them', async () => {
      const item = (await fx.wishlists.findById(LIST_A, NOW))!.getItem(ITEM_A);
      item.recordEvent();
      item.recordPurchase();

      await fx.wishlists.saveItemState(item);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);
      expect(reloaded?.item?.seq).toBe(2);
      expect(reloaded?.item?.purchasedCount).toBe(1);
      expect(reloaded?.itemStatusAt(ITEM_A, NOW)).toBe('purchased');
    });

    it('saveItemState refuses an item claiming another list, and changes nothing', async () => {
      const impostor = Item.reconstitute({ id: ITEM_A, wishlistId: LIST_B, type: 'single', title: 'Cot', quantity: 1, seq: 9, purchasedCount: 1 });
      await expect(fx.wishlists.saveItemState(impostor)).rejects.toThrow(ItemNotFoundError);
      expect((await fx.wishlists.findById(LIST_A, NOW))?.item?.seq).toBe(0);
    });

    it('saveItemState refuses an item that does not exist', async () => {
      const ghost = Item.reconstitute({ id: '00000000-0000-7000-8000-999999999999', wishlistId: LIST_A, type: 'single', title: 'Ghost', quantity: 1, seq: 1, purchasedCount: 0 });
      await expect(fx.wishlists.saveItemState(ghost)).rejects.toThrow(ItemNotFoundError);
    });
  });
}
```

Create `apps/api/src/application/test-fakes/InMemoryRepositories.contract.test.ts`:

```ts
import { describeHoldRepositoryContract } from '../ports/contracts/holdRepository.contract.js';
import { describeWishlistRepositoryContract } from '../ports/contracts/wishlistRepository.contract.js';
import type { PersistenceFactory } from '../ports/contracts/fixture.js';
import { inMemoryPersistence } from './InMemoryRepositories.js';

const inMemory: PersistenceFactory = async () => {
  const { wishlists, holds, eventStore } = inMemoryPersistence();
  return {
    wishlists, holds, eventStore,
    recordedEvents: async (itemId) => eventStore.recorded(itemId).map(({ event, actor }) => ({ type: event.type, actor, payload: event })),
    dispose: async () => {},
  };
};

describeWishlistRepositoryContract('in-memory', inMemory);
describeHoldRepositoryContract('in-memory', inMemory);
```

Create `apps/api/src/infrastructure/contracts.integration.test.ts`:

```ts
import { describeHoldRepositoryContract } from '../application/ports/contracts/holdRepository.contract.js';
import { describeWishlistRepositoryContract } from '../application/ports/contracts/wishlistRepository.contract.js';
import type { PersistenceFactory } from '../application/ports/contracts/fixture.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import { EventStoreKysely } from './EventStoreKysely.js';
import { HoldRepositoryKysely } from './HoldRepositoryKysely.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';

const kysely: PersistenceFactory = async () => {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  return {
    wishlists: new WishlistRepositoryKysely(db),
    holds: new HoldRepositoryKysely(db),
    eventStore: new EventStoreKysely(db),
    recordedEvents: async (itemId) => {
      const rows = await db.selectFrom('event_log').select(['event_type', 'actor', 'payload']).where('item_id', '=', itemId).orderBy('seq').execute();
      return rows.map((row) => ({ type: row.event_type, actor: row.actor, payload: JSON.parse(row.payload) as LedgerEvent }));
    },
    dispose: () => db.destroy(),
  };
};

describeWishlistRepositoryContract('Kysely/SQLite', kysely);
describeHoldRepositoryContract('Kysely/SQLite', kysely);
```

- [ ] **Step 7: Change the ports**

Replace `apps/api/src/application/ports/HoldRepository.ts` with:

```ts
import type { Hold } from '../../domain/entities/Hold.js';

/**
 * Holds in domain terms (holds-lifecycle D9): no rows, no SQL vocabulary.
 * Every method's behaviour, including the D8 expiry boundary, is pinned by
 * application/ports/contracts/holdRepository.contract.ts against every
 * implementation.
 */
export interface HoldRepository {
  insert(hold: Hold): Promise<void>;
  /** Persists the hold's lifecycle — expiry and its extended/released/purchased instants — as the domain left them. */
  save(hold: Hold): Promise<void>;
  /** Any hold, whatever its state; null for an unknown (or malformed) id. Callers must still check the hold is on their list. */
  findById(holdId: string): Promise<Hold | null>;
  findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Hold | null>;
  /**
   * The list's holds active at `now` — not released, not purchased, and
   * `now <= expiresAt` — and no others (D8). Expired holds are never
   * closed under lazy expiry, so "every unclosed hold" would grow without
   * bound; the domain re-checks each one with `statusAt(now)`.
   */
  findActiveForWishlist(wishlistId: string, now: Date): Promise<Hold[]>;
  /** Every hold `sessionHash` placed on the list, whatever its state, for "Your holds" — expired ones included, since D15 lets them be purchased. */
  findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]>;
}
```

Replace `apps/api/src/application/ports/WishlistRepository.ts` with:

```ts
import type { Item } from '../../domain/entities/Item.js';
import type { Wishlist } from '../../domain/entities/Wishlist.js';

/**
 * The aggregate's repository (ADR-0078): it loads and stores a `Wishlist`
 * together with its item and the list's active holds, so callers never
 * assemble an aggregate from separate lookups.
 */
export interface WishlistRepository {
  /** Persists the wishlist along with its attached item and that item's state. */
  insert(wishlist: Wishlist): Promise<void>;
  /**
   * Loads the full aggregate as of `now` — its item and every hold on the
   * list still active at `now` (D8) — or null if no such wishlist. The
   * snapshot is only meaningful at an instant, hence `now`.
   */
  findBySlug(slug: string, now: Date): Promise<Wishlist | null>;
  findById(id: string, now: Date): Promise<Wishlist | null>;
  /**
   * Writes an item's `seq` and `purchasedCount` exactly as the domain left
   * them — no read-before-write, no arithmetic of its own (roadmap open
   * item 2). Throws ItemNotFoundError unless the item exists on
   * `item.wishlistId`.
   */
  saveItemState(item: Item): Promise<void>;
}
```

Replace `apps/api/src/application/ports/ItemRepository.ts` with:

```ts
import type { Item } from '../../domain/entities/Item.js';

/**
 * Not a use-case-facing port: use cases reach an item only through the
 * `Wishlist` aggregate (ADR-0078). This is the collaborator a
 * `WishlistRepository` implementation assembles that aggregate from, which
 * is why it is absent from `TransactionContext`.
 */
export interface ItemRepository {
  insert(item: Item): Promise<void>;
  findByWishlistId(wishlistId: string): Promise<Item | null>;
  /** See `WishlistRepository.saveItemState`, which delegates here. */
  saveState(item: Item): Promise<void>;
}
```

- [ ] **Step 8: Rewrite the in-memory fakes**

Replace `apps/api/src/application/test-fakes/InMemoryRepositories.ts` with:

```ts
import { Hold } from '../../domain/entities/Hold.js';
import { Item } from '../../domain/entities/Item.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';
import type { Actor } from '../../domain/Actor.js';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';
import { ConcurrencyError, ItemNotFoundError } from '../../domain/errors.js';
import type { EventStore } from '../ports/EventStore.js';
import type { HoldRepository } from '../ports/HoldRepository.js';
import type { TransactionContext, UnitOfWork } from '../ports/UnitOfWork.js';
import type { WishlistRepository } from '../ports/WishlistRepository.js';

/**
 * Copies through `reconstitute`, the way a real repository rebuilds rows.
 * Neither reads nor writes may share an instance with the store: the
 * domain mutates items and holds in place, so a shared instance would let
 * an unpersisted decision show up on the next read — which a SELECT never
 * could.
 */
function copyItem(item: Item): Item {
  return Item.reconstitute({
    id: item.id.value, wishlistId: item.wishlistId.value, type: item.type, title: item.title,
    quantity: item.quantity, seq: item.seq, purchasedCount: item.purchasedCount,
  });
}

function copyHold(hold: Hold): Hold {
  return Hold.reconstitute({
    id: hold.id.value, itemId: hold.itemId.value, secret: hold.secret.value, sessionHash: hold.sessionHash.value,
    idempotencyKey: hold.idempotencyKey.value, expiresAt: hold.expiresAt,
    extendedAt: hold.extendedAt, releasedAt: hold.releasedAt, purchasedAt: hold.purchasedAt,
  });
}

/**
 * The fakes' tables. One store per test, shared by every fake built on it,
 * so a hold inserted through the hold repository shows up in the wishlist
 * repository's next load — as rows in one database would.
 */
export class InMemoryStore {
  readonly wishlists = new Map<string, Wishlist>();
  readonly items = new Map<string, Item>();
  readonly holds = new Map<string, Hold>();
  readonly streams = new Map<string, { event: LedgerEvent; actor: Actor }[]>();

  holdsOnList(wishlistId: string): Hold[] {
    return [...this.holds.values()].filter((hold) => this.items.get(hold.itemId.value)?.wishlistId.value === wishlistId);
  }
}

export class InMemoryWishlistRepository implements WishlistRepository {
  constructor(private store: InMemoryStore) {}

  async insert(wishlist: Wishlist): Promise<void> {
    this.store.wishlists.set(wishlist.id.value, wishlist);
    const item = wishlist.item;
    if (item !== null) this.store.items.set(item.id.value, copyItem(item));
  }

  async findBySlug(slug: string, now: Date): Promise<Wishlist | null> {
    return this.hydrate([...this.store.wishlists.values()].find((w) => w.slug.value === slug), now);
  }

  async findById(id: string, now: Date): Promise<Wishlist | null> {
    return this.hydrate(this.store.wishlists.get(id), now);
  }

  async saveItemState(item: Item): Promise<void> {
    const stored = this.store.items.get(item.id.value);
    if (!stored || stored.wishlistId.value !== item.wishlistId.value) throw new ItemNotFoundError(item.id.value);
    this.store.items.set(item.id.value, copyItem(item));
  }

  private hydrate(wishlist: Wishlist | undefined, now: Date): Wishlist | null {
    if (wishlist === undefined) return null;
    const item = [...this.store.items.values()].find((i) => i.wishlistId.value === wishlist.id.value);
    const activeHolds = this.store.holdsOnList(wishlist.id.value).filter((h) => h.statusAt(now) === 'active').map(copyHold);
    return Wishlist.reconstitute({
      id: wishlist.id.value, slug: wishlist.slug.value, title: wishlist.title,
      ownerToken: wishlist.ownerToken.value, key: wishlist.key.value, keyGen: wishlist.keyGen,
      item: item ? copyItem(item) : undefined, activeHolds,
    });
  }
}

export class InMemoryHoldRepository implements HoldRepository {
  constructor(private store: InMemoryStore) {}

  /** Mirrors the table's primary key and UNIQUE (item_id, idempotency_key). */
  async insert(hold: Hold): Promise<void> {
    const clash = this.store.holds.has(hold.id.value) || [...this.store.holds.values()].some(
      (h) => h.itemId.value === hold.itemId.value && h.idempotencyKey.value === hold.idempotencyKey.value,
    );
    if (clash) throw new Error(`UNIQUE constraint failed: holds (${hold.id.value})`);
    this.store.holds.set(hold.id.value, copyHold(hold));
  }

  async save(hold: Hold): Promise<void> {
    if (!this.store.holds.has(hold.id.value)) throw new Error(`No hold ${hold.id.value} to save`);
    this.store.holds.set(hold.id.value, copyHold(hold));
  }

  async findById(holdId: string): Promise<Hold | null> {
    const hold = this.store.holds.get(holdId);
    return hold ? copyHold(hold) : null;
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Hold | null> {
    const hold = [...this.store.holds.values()].find((h) => h.itemId.value === itemId && h.idempotencyKey.value === idempotencyKey);
    return hold ? copyHold(hold) : null;
  }

  async findActiveForWishlist(wishlistId: string, now: Date): Promise<Hold[]> {
    return this.store.holdsOnList(wishlistId).filter((h) => h.statusAt(now) === 'active').map(copyHold);
  }

  async findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]> {
    return this.store.holdsOnList(wishlistId).filter((h) => h.belongsToSession(sessionHash)).map(copyHold);
  }
}

export class InMemoryEventStore implements EventStore {
  constructor(private store: InMemoryStore) {}

  async append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void> {
    const stream = this.store.streams.get(itemId) ?? [];
    if (stream.length !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, stream.length);
    }
    this.store.streams.set(itemId, [...stream, ...events.map((event) => ({ event, actor }))]);
  }

  /** What a stream holds, envelope included — tests read it to check what a use case appended and as whom. */
  recorded(itemId: string): readonly { event: LedgerEvent; actor: Actor }[] {
    return this.store.streams.get(itemId) ?? [];
  }
}

/** No real transactionality — fine for use-case unit tests, which never assert rollback; the Kysely integration tests cover that. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private ctx: TransactionContext) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return fn(this.ctx);
  }
}

/** One store and every fake on it, wired as a use case expects. */
export function inMemoryPersistence() {
  const store = new InMemoryStore();
  const wishlists = new InMemoryWishlistRepository(store);
  const holds = new InMemoryHoldRepository(store);
  const eventStore = new InMemoryEventStore(store);
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, holds, eventStore });
  return { store, wishlists, holds, eventStore, unitOfWork };
}
```

Replace `apps/api/src/application/test-fakes/InMemoryRepositories.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { inMemoryPersistence } from './InMemoryRepositories.js';
import { aWishlist } from './builders.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const T0 = new Date('2026-01-01T00:00:00.000Z');
const holdProps = { itemId: ITEM_ID, sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1', now: T0, durationMs: 60_000 };
const tokens = { generateEntityId: () => '44444444-4444-7444-8444-444444444444', generateHoldSecret: () => 'hold-secret-1' };
const hasher = { hash: (value: string) => value };

/**
 * Behaviour every repository shares is pinned by the port contract suites,
 * run against these fakes and the Kysely adapters alike. What stays here is
 * the one thing only a fake can get wrong: sharing instances with its store.
 */
describe('in-memory fakes never share instances with the store', () => {
  it('reconstitutes on every read', async () => {
    const { wishlists } = inMemoryPersistence();
    const inserted = aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build();
    await wishlists.insert(inserted);

    const first = await wishlists.findBySlug('abc123', T0);
    const second = await wishlists.findBySlug('abc123', T0);

    expect(first).not.toBe(inserted);
    expect(second).not.toBe(first);
    expect(second?.item).not.toBe(first?.item);
    expect(first?.item?.id.value).toBe(ITEM_ID);
  });

  it('does not leak an unpersisted hold decision into the next read', async () => {
    const { wishlists } = inMemoryPersistence();
    await wishlists.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());

    (await wishlists.findById(WISHLIST_ID, T0))!.holdItem(holdProps, tokens, hasher);

    const fresh = await wishlists.findById(WISHLIST_ID, T0);
    expect(fresh?.itemStatusAt(ITEM_ID, T0)).toBe('available');
    expect(fresh?.item?.seq).toBe(0);
  });

  it('does not let a caller change a stored hold through the instance it inserted', async () => {
    const { wishlists, holds } = inMemoryPersistence();
    await wishlists.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    const { hold } = (await wishlists.findById(WISHLIST_ID, T0))!.holdItem(holdProps, tokens, hasher);
    await holds.insert(hold);

    hold.release(T0);

    expect((await holds.findById(hold.id.value))?.releasedAt).toBeNull();
  });
});
```

In `apps/api/src/application/test-fakes/builders.ts`, in `ItemBuilder`: change the default props' `activeHolds: 0` to `purchasedCount: 0`, and replace `withActiveHolds` with:

```ts
  withPurchasedCount(purchasedCount: number): this { this.props.purchasedCount = purchasedCount; return this; }
```

In `apps/api/src/application/test-fakes/builders.test.ts`, replace line 21 with:

```ts
    expect(wishlist.itemStatusAt('77777777-7777-7777-8777-777777777777', new Date('2026-01-01T00:00:00Z'))).toBe('available');
```

- [ ] **Step 9: Change the Kysely adapters and drop `active_holds`**

In `0001_init.ts`, delete the line `.addColumn('active_holds', 'integer', (col) => col.notNull())` from `item_state`. In `schema.ts`, delete `active_holds: number;` from `ItemStateTable`. In `apps/api/src/infrastructure/db/schema.integration.test.ts`, delete `active_holds: 0, ` from both `item_state` inserts.

Replace `apps/api/src/infrastructure/HoldRepositoryKysely.ts` with:

```ts
import type { Kysely, Selectable } from 'kysely';
import type { Database, HoldsTable } from './db/schema.js';
import type { HoldRepository } from '../application/ports/HoldRepository.js';
import { Hold } from '../domain/entities/Hold.js';

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function toHold(row: Selectable<HoldsTable>): Hold {
  return Hold.reconstitute({
    id: row.id, itemId: row.item_id, secret: row.secret, sessionHash: row.session_hash,
    idempotencyKey: row.idempotency_key, expiresAt: new Date(row.expires_at),
    extendedAt: toDate(row.extended_at), releasedAt: toDate(row.released_at), purchasedAt: toDate(row.purchased_at),
  });
}

/**
 * The lifecycle columns as the domain left them. Every instant goes through
 * toISOString(), so the stored text has one fixed shape (UTC, milliseconds,
 * `Z`) and string comparison in SQL is time order — findActiveForWishlist
 * depends on that.
 */
function lifecycleColumns(hold: Hold) {
  return {
    expires_at: hold.expiresAt.toISOString(),
    extended_at: hold.extendedAt?.toISOString() ?? null,
    released_at: hold.releasedAt?.toISOString() ?? null,
    purchased_at: hold.purchasedAt?.toISOString() ?? null,
  };
}

export class HoldRepositoryKysely implements HoldRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(hold: Hold): Promise<void> {
    await this.db.insertInto('holds').values({
      id: hold.id.value, item_id: hold.itemId.value, secret: hold.secret.value, session_hash: hold.sessionHash.value,
      idempotency_key: hold.idempotencyKey.value, ...lifecycleColumns(hold), created_at: new Date().toISOString(),
    }).execute();
  }

  async save(hold: Hold): Promise<void> {
    const result = await this.db.updateTable('holds').set(lifecycleColumns(hold)).where('id', '=', hold.id.value).executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw new Error(`No hold ${hold.id.value} to save`);
  }

  async findById(holdId: string): Promise<Hold | null> {
    const row = await this.db.selectFrom('holds').selectAll().where('id', '=', holdId).executeTakeFirst();
    return row ? toHold(row) : null;
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Hold | null> {
    const row = await this.db.selectFrom('holds').selectAll()
      .where('item_id', '=', itemId).where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
    return row ? toHold(row) : null;
  }

  async findActiveForWishlist(wishlistId: string, now: Date): Promise<Hold[]> {
    const rows = await this.db.selectFrom('holds')
      .innerJoin('items', 'items.id', 'holds.item_id')
      .selectAll('holds')
      .where('items.wishlist_id', '=', wishlistId)
      .where('holds.released_at', 'is', null)
      .where('holds.purchased_at', 'is', null)
      // Active means now <= expiresAt — still active at the very instant it
      // expires — so the boundary row is included.
      .where('holds.expires_at', '>=', now.toISOString())
      .orderBy('holds.expires_at')
      .execute();
    return rows.map(toHold);
  }

  async findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]> {
    const rows = await this.db.selectFrom('holds')
      .innerJoin('items', 'items.id', 'holds.item_id')
      .selectAll('holds')
      .where('items.wishlist_id', '=', wishlistId)
      .where('holds.session_hash', '=', sessionHash)
      .orderBy('holds.expires_at')
      .execute();
    return rows.map(toHold);
  }
}
```

Replace `apps/api/src/infrastructure/ItemRepositoryKysely.ts` with:

```ts
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { ItemRepository } from '../application/ports/ItemRepository.js';
import { Item } from '../domain/entities/Item.js';
import { ItemNotFoundError } from '../domain/errors.js';

export class ItemRepositoryKysely implements ItemRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(item: Item): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto('items').values({
      id: item.id.value, wishlist_id: item.wishlistId.value, type: item.type, title: item.title,
      quantity: item.quantity, created_at: now,
    }).execute();
    await this.db.insertInto('item_state').values({
      item_id: item.id.value, seq: item.seq, purchased_count: item.purchasedCount, updated_at: now,
    }).execute();
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items')
      .innerJoin('item_state', 'item_state.item_id', 'items.id')
      .selectAll('items')
      .select(['item_state.seq as seq', 'item_state.purchased_count as purchased_count'])
      .where('wishlist_id', '=', wishlistId)
      .executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({
      id: row.id, wishlistId: row.wishlist_id, type: row.type, title: row.title, quantity: row.quantity,
      seq: row.seq, purchasedCount: row.purchased_count,
    });
  }

  async saveState(item: Item): Promise<void> {
    const result = await this.db.updateTable('item_state')
      .set({ seq: item.seq, purchased_count: item.purchasedCount, updated_at: new Date().toISOString() })
      .where('item_id', '=', item.id.value)
      // Scoped by wishlist as well as id: a write lands only on an item of
      // the list the aggregate was loaded for.
      .where('item_id', 'in', this.db.selectFrom('items').select('items.id').where('items.wishlist_id', '=', item.wishlistId.value))
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw new ItemNotFoundError(item.id.value);
  }
}
```

Replace `apps/api/src/infrastructure/WishlistRepositoryKysely.ts` with:

```ts
import type { Kysely, Selectable } from 'kysely';
import type { Database, WishlistsTable } from './db/schema.js';
import type { WishlistRepository } from '../application/ports/WishlistRepository.js';
import type { Item } from '../domain/entities/Item.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { HoldRepositoryKysely } from './HoldRepositoryKysely.js';
import { ItemRepositoryKysely } from './ItemRepositoryKysely.js';

/**
 * The aggregate's SQLite adapter (ADR-0078). Its item and hold
 * collaborators are built on the *same* Kysely/transaction instance, so
 * everything it reads and writes takes part in the caller's transaction.
 */
export class WishlistRepositoryKysely implements WishlistRepository {
  private items: ItemRepositoryKysely;
  private holds: HoldRepositoryKysely;

  constructor(private db: Kysely<Database>) {
    this.items = new ItemRepositoryKysely(db);
    this.holds = new HoldRepositoryKysely(db);
  }

  async insert(wishlist: Wishlist): Promise<void> {
    await this.db.insertInto('wishlists').values({
      id: wishlist.id.value, slug: wishlist.slug.value, title: wishlist.title,
      owner_token: wishlist.ownerToken.value, key: wishlist.key.value, key_gen: wishlist.keyGen,
      created_at: new Date().toISOString(),
    }).execute();
    const item = wishlist.item;
    if (item !== null) await this.items.insert(item);
  }

  async findBySlug(slug: string, now: Date): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('slug', '=', slug).executeTakeFirst();
    return row ? this.hydrate(row, now) : null;
  }

  async findById(id: string, now: Date): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? this.hydrate(row, now) : null;
  }

  async saveItemState(item: Item): Promise<void> {
    await this.items.saveState(item);
  }

  /** Active holds only (D8), so the aggregate stays bounded however long the list has been in use. */
  private async hydrate(row: Selectable<WishlistsTable>, now: Date): Promise<Wishlist> {
    const item = await this.items.findByWishlistId(row.id);
    const activeHolds = await this.holds.findActiveForWishlist(row.id, now);
    return Wishlist.reconstitute({
      id: row.id, slug: row.slug, title: row.title,
      ownerToken: row.owner_token, key: row.key, keyGen: row.key_gen,
      item: item ?? undefined, activeHolds,
    });
  }
}
```

Replace `apps/api/src/infrastructure/persistence.integration.test.ts` with what stays adapter-specific. The repositories are covered by `contracts.integration.test.ts` now.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import type { Database } from './db/schema.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';
import { EventStoreKysely } from './EventStoreKysely.js';
import { UnitOfWorkKysely } from './UnitOfWorkKysely.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { ConcurrencyError } from '../domain/errors.js';
import { anItemHeldEvent } from '../application/test-fakes/builders.js';

const W1 = '11111111-1111-7111-8111-111111111111';
const I1 = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00.000Z');

let db: Kysely<Database>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
});

describe('EventStoreKysely', () => {
  it('appends events when expectedSeq matches the stream length', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    const rows = await db.selectFrom('event_log').selectAll().where('item_id', '=', I1).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(1);
  });

  it('records the actor on the row as envelope metadata, not in the payload (ADR-0075)', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    const row = await db.selectFrom('event_log').select(['actor', 'payload']).where('item_id', '=', I1).executeTakeFirstOrThrow();
    expect(row.actor).toBe('guest');
    expect(JSON.parse(row.payload)).not.toHaveProperty('actor');
    expect(JSON.parse(row.payload)).toMatchObject({ v: 1 });
  });

  it('throws ConcurrencyError when expectedSeq is stale', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    await expect(
      store.append(I1, 0, [anItemHeldEvent({ itemId: I1, holdId: '66666666-6666-7666-8666-666666666666' })], 'guest'),
    ).rejects.toThrow(ConcurrencyError);
  });
});

describe('UnitOfWorkKysely', () => {
  it('commits all writes made inside a successful execute() call', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await unitOfWork.execute(async (ctx) => {
      await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
    });

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123', NOW)).not.toBeNull();
  });

  it('rolls back all writes when the callback throws', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await expect(
      unitOfWork.execute(async (ctx) => {
        await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123', NOW)).toBeNull();
  });
});
```

- [ ] **Step 10: Move the callers onto the new aggregate API**

Replace the body of `HoldItem.execute` in `apps/api/src/application/use-cases/HoldItem.ts` (keep the class, constructor and input/output types as they are) with:

```ts
  async execute(input: HoldItemInput): Promise<HoldItemOutput> {
    return this.unitOfWork.execute(async (ctx) => {
      // Read once: the aggregate's active holds are loaded as of this
      // instant, and every decision below is taken at the same one.
      const now = this.clock.now();
      // An unknown wishlist and an item that isn't in it are the same
      // failure from this use case's contract: there is no such item to hold.
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new ItemNotFoundError(input.itemId);
      wishlist.getItem(input.itemId);

      // Deliberately before the availability check: a replayed idempotency
      // key must return the original hold, not trip ItemUnavailableError on
      // the hold it created itself.
      const existing = await ctx.holds.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) {
        return { holdId: existing.id.value, itemId: existing.itemId.value, expiresAt: existing.expiresAt.toISOString() };
      }

      const { hold, item, event, expectedSeq } = wishlist.holdItem({
        itemId: input.itemId,
        sessionHash: this.hasher.hash(input.sessionId),
        idempotencyKey: input.idempotencyKey,
        now,
        durationMs: HOLD_DURATION_MS,
      }, this.tokenGenerator, this.hasher);

      // Placing a hold is guest-only (ADR-0075), and HoldItem is only ever
      // reached with a guest session, so the actor is fixed here.
      await ctx.eventStore.append(item.id.value, expectedSeq, [event], 'guest');
      await ctx.holds.insert(hold);
      // Persist exactly what the domain decided — the write path never
      // decides availability itself (roadmap open item 2).
      await ctx.wishlists.saveItemState(item);

      return { holdId: hold.id.value, itemId: hold.itemId.value, expiresAt: hold.expiresAt.toISOString() };
    });
  }
```

Replace `apps/api/src/application/use-cases/HoldItem.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { HoldItem } from './HoldItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { ItemNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00Z');

async function makeUseCase() {
  const persistence = inMemoryPersistence();
  await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
  const useCase = new HoldItem(persistence.unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new FakeHasher());
  return { useCase, ...persistence };
}

const holdInput = (sessionId = 'session-abc', idempotencyKey = 'idem-1') => ({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId, idempotencyKey });

describe('HoldItem', () => {
  it('holds an available item, which reloads as held', async () => {
    const { useCase, wishlists, holds } = await makeUseCase();

    const result = await useCase.execute(holdInput());

    expect(result.itemId).toBe(ITEM_ID);
    expect(result.expiresAt).toBe('2026-01-04T00:00:00.000Z');
    expect((await wishlists.findById(WISHLIST_ID, NOW))?.itemStatusAt(ITEM_ID, NOW)).toBe('held');
    const recorded = await holds.findByIdempotencyKey(ITEM_ID, 'idem-1');
    expect(recorded?.sessionHash.value).toBe('df98a8544084cba1bfbcf00faea193bf73d10ae13eada8c8bacf2c7f1e1d92f4');
  });

  it('appends ItemHeld to the item stream as the guest (ADR-0075)', async () => {
    const { useCase, eventStore } = await makeUseCase();

    await useCase.execute(holdInput());

    const recorded = eventStore.recorded(ITEM_ID);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].actor).toBe('guest');
    expect(recorded[0].event).toMatchObject({ type: 'ItemHeld', v: 1, itemId: ITEM_ID });
  });

  it('replays the original result for a repeated idempotency key instead of creating a second hold', async () => {
    const { useCase, eventStore } = await makeUseCase();

    const first = await useCase.execute(holdInput());
    const second = await useCase.execute(holdInput());

    expect(second).toEqual(first);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(1);
  });

  it('persists the seq the domain advanced to, so a reload appends after the hold', async () => {
    const { useCase, wishlists } = await makeUseCase();

    await useCase.execute(holdInput());

    expect((await wishlists.findById(WISHLIST_ID, NOW))?.item?.seq).toBe(1);
  });

  it('throws ItemUnavailableError for a second, different hold on a held item', async () => {
    const { useCase } = await makeUseCase();
    await useCase.execute(holdInput());

    await expect(useCase.execute(holdInput('session-xyz', 'idem-2'))).rejects.toThrow(ItemUnavailableError);
  });

  it('throws ItemNotFoundError for an unknown wishlist or item', async () => {
    const { useCase } = await makeUseCase();

    await expect(useCase.execute({ ...holdInput(), wishlistId: 'no-such-wishlist' })).rejects.toThrow(ItemNotFoundError);
    await expect(useCase.execute({ ...holdInput(), itemId: '44444444-4444-7444-8444-444444444444' })).rejects.toThrow(ItemNotFoundError);
  });
});
```

In `apps/api/src/application/use-cases/EnterGuestKey.ts`, add `import type { Clock } from '../ports/Clock.js';`, add a fourth constructor parameter `private clock: Clock,`, and change the lookup to:

```ts
    const wishlist = await this.wishlists.findBySlug(input.slug, this.clock.now());
```

In `EnterGuestKey.test.ts`:
- Replace the `InMemoryWishlistRepository` import with `import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';` and add `import { FixedClock } from '../test-fakes/FixedClock.js';`.
- Replace each `const wishlists = new InMemoryWishlistRepository();` with `const { wishlists } = inMemoryPersistence();`.
- Pass `new FixedClock(new Date('2026-01-01T00:00:00Z'))` as the fourth argument to every `new EnterGuestKey(…)`.
- Change the `seedWishlist` parameter type to `{ insert(w: Wishlist): Promise<void> }`.

In `CreateList.test.ts`, replace `makeUseCase` and its imports with:

```ts
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';

function makeUseCase() {
  const { wishlists, unitOfWork } = inMemoryPersistence();
  const useCase = new CreateList(unitOfWork, new SequentialTokenGenerator());
  return { useCase, wishlists };
}
```

and change `wishlists.findBySlug('slug-1')` to `wishlists.findBySlug('slug-1', new Date('2026-01-01T00:00:00Z'))`.

In `apps/api/src/presentation/compositionRoot.ts`:
- Add `import type { Clock } from '../application/ports/Clock.js';`.
- Add `clock: Clock;` to `AppDependencies`.
- Pass `clock` as the fourth argument of `new EnterGuestKey(wishlists, secretComparer, tokenGenerator, clock)`.
- Add `clock,` to the returned object.

In `apps/api/src/presentation/openApiDocument.ts`, add `clock: unusedDependency('clock'),` to `noDependencies`.

In `apps/api/src/presentation/routes.ts`, the GET handler: replace `const wishlist = await deps.wishlists.findBySlug(request.params.slug);` with:

```ts
    const now = deps.clock.now();
    const wishlist = await deps.wishlists.findBySlug(request.params.slug, now);
```

and the response with:

```ts
    return reply.code(200).send({
      title: wishlist.title,
      item: { id: item.id.value, title: item.title, status: wishlist.itemStatusAt(item.id.value, now) },
    });
```

In the hold handler, replace `await deps.wishlists.findBySlug(slug)` with `await deps.wishlists.findBySlug(slug, deps.clock.now())`.

In `packages/shared-types/src/listView.ts`, change the enum to:

```ts
export const itemStatusSchema = z.enum(['available', 'held', 'purchased']);
```

- [ ] **Step 11: Regenerate the contract and run everything**

```bash
npm run gen:api
git diff --stat apps/api/openapi.json apps/web/src/api/schema.gen.ts
npm run lint && npm test && npm run build
```

Expected: both generated files change (the status enum gains `purchased`), and lint, tests and build pass. The contract suites run twice each, once per adapter set.

- [ ] **Step 12: Record roadmap open item 2 as resolved**

In `docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md`, replace open item 2's text with:

```markdown
2. ~~**Verify the quantity-1 assumption is gone** before starting 3.~~ Done in
   holds stack A, PR 4: `item_state.active_holds` is dropped, availability is
   decided by `Wishlist` from the list's active holds, and
   `WishlistRepository.saveItemState` writes only what the domain decided —
   no read-before-write, pinned by the port contract suite.
```

- [ ] **Step 13: Commit**

```bash
git add apps/api packages/shared-types apps/web/src/api/schema.gen.ts docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md
git commit -m "feat(api): the Wishlist aggregate loads active holds and decides availability from them

Drops item_state.active_holds (D4); saveItemState replaces markHeld
(roadmap open item 2); port contract suites run against the in-memory
fakes and the Kysely adapters (D8, D9).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 4.2: EventStore contract suite

**Files:**
- Create: `apps/api/src/application/ports/contracts/eventStore.contract.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.contract.test.ts`, `apps/api/src/infrastructure/contracts.integration.test.ts`
- Modify: `apps/api/src/infrastructure/persistence.integration.test.ts` (delete the `EventStoreKysely` block it supersedes)

**Interfaces:**
- Consumes: `PersistenceFixture.recordedEvents`, `anItemHeldEvent`.
- Produces: `describeEventStoreContract(adapter: string, factory: PersistenceFactory)`.

- [ ] **Step 1: Write the suite**

Create `apps/api/src/application/ports/contracts/eventStore.contract.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyError } from '../../../domain/errors.js';
import type { HoldReleasedEvent } from '../../../domain/events/HoldReleasedEvent.js';
import { anItemHeldEvent } from '../../test-fakes/builders.js';
import { ITEM_A, ITEM_B, type PersistenceFactory, type PersistenceFixture } from './fixture.js';

const released = (holdId: string): HoldReleasedEvent => ({ type: 'HoldReleased', v: 1, holdId, occurredAt: '2026-01-02T00:00:00.000Z' });

export function describeEventStoreContract(adapter: string, factory: PersistenceFactory): void {
  describe(`EventStore contract (${adapter})`, () => {
    let fx: PersistenceFixture;
    beforeEach(async () => { fx = await factory(); });
    afterEach(async () => { await fx.dispose(); });

    it('appends at the stream length, recording each event with its actor', async () => {
      const held = anItemHeldEvent({ itemId: ITEM_A });
      await fx.eventStore.append(ITEM_A, 0, [held], 'guest');
      await fx.eventStore.append(ITEM_A, 1, [released(held.holdId)], 'guest');

      expect(await fx.recordedEvents(ITEM_A)).toEqual([
        { type: 'ItemHeld', actor: 'guest', payload: held },
        { type: 'HoldReleased', actor: 'guest', payload: released(held.holdId) },
      ]);
    });

    it('appends several events in one call, in order', async () => {
      const held = anItemHeldEvent({ itemId: ITEM_A });
      await fx.eventStore.append(ITEM_A, 0, [held, released(held.holdId)], 'guest');
      expect((await fx.recordedEvents(ITEM_A)).map((e) => e.type)).toEqual(['ItemHeld', 'HoldReleased']);
    });

    it('throws ConcurrencyError on a stale expectedSeq and writes nothing', async () => {
      await fx.eventStore.append(ITEM_A, 0, [anItemHeldEvent({ itemId: ITEM_A })], 'guest');

      await expect(fx.eventStore.append(ITEM_A, 0, [released('x')], 'guest')).rejects.toThrow(ConcurrencyError);
      expect(await fx.recordedEvents(ITEM_A)).toHaveLength(1);
    });

    it('keeps each item its own stream (ADR-0008)', async () => {
      await fx.eventStore.append(ITEM_A, 0, [anItemHeldEvent({ itemId: ITEM_A })], 'guest');
      await fx.eventStore.append(ITEM_B, 0, [anItemHeldEvent({ itemId: ITEM_B })], 'guest');
      expect(await fx.recordedEvents(ITEM_B)).toHaveLength(1);
    });
  });
}
```

Add to both runner files the import `import { describeEventStoreContract } from '…/ports/contracts/eventStore.contract.js';` (relative path as for the other two suites) and the call `describeEventStoreContract('in-memory', inMemory);` / `describeEventStoreContract('Kysely/SQLite', kysely);`.

- [ ] **Step 2: Run it**

Run: `npm run test --workspace=apps/api -- contract`
Expected: PASS for both adapters. A failure here means an adapter disagrees with the port, and it must be fixed in that adapter. No adapter code is expected to change.

- [ ] **Step 3: Delete what the suite supersedes**

In `persistence.integration.test.ts`, delete `describe('EventStoreKysely', …)` and the then-unused imports (`EventStoreKysely`, `ConcurrencyError`, `anItemHeldEvent`, `I1`). Keep the actor-not-in-payload assertion by moving that one test into `eventStore.contract.ts`:

```ts
    it('keeps the actor out of the payload: it is envelope metadata (ADR-0075)', async () => {
      await fx.eventStore.append(ITEM_A, 0, [anItemHeldEvent({ itemId: ITEM_A })], 'guest');
      const [recorded] = await fx.recordedEvents(ITEM_A);
      expect(recorded.payload).not.toHaveProperty('actor');
      expect(recorded.payload).toMatchObject({ v: 1 });
    });
```

- [ ] **Step 4: Run, then commit**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "test(api): EventStore contract suite for both adapter sets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 4.3: `BEGIN IMMEDIATE`

**Files:**
- Create: `apps/api/src/infrastructure/db/immediateTransaction.ts`
- Modify: `apps/api/src/infrastructure/db/createDb.ts`
- Modify: `apps/api/src/infrastructure/UnitOfWorkKysely.ts`
- Test: `apps/api/src/infrastructure/persistence.integration.test.ts`

**Interfaces:**
- Produces:
  - `inImmediateTransaction<T>(db: Kysely<Database>, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T>`
  - `createDb(path: string, options?: { busyTimeoutMs?: number }): Kysely<Database>`

- [ ] **Step 1: Write the failing test**

Add to `persistence.integration.test.ts`. Imports:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';
```

(Merge `onTestFinished` into the existing `vitest` import.) Then inside `describe('UnitOfWorkKysely', …)`:

```ts
  it('takes the write lock at BEGIN, so a second writer cannot even start (BEGIN IMMEDIATE)', async () => {
    // Two connections need a file; an in-memory database is per-connection.
    const dir = mkdtempSync(join(tmpdir(), 'gubbins-uow-'));
    const first = createDb(join(dir, 'test.db'));
    await migrateToLatest(first);
    // No busy wait: better-sqlite3 waits synchronously, which on one thread
    // would block the first transaction from ever finishing.
    const second = createDb(join(dir, 'test.db'), { busyTimeoutMs: 0 });
    onTestFinished(async () => {
      await first.destroy();
      await second.destroy();
      rmSync(dir, { recursive: true, force: true });
    });

    let secondStarted = false;
    await new UnitOfWorkKysely(first).execute(async () => {
      await expect(new UnitOfWorkKysely(second).execute(async () => { secondStarted = true; }))
        .rejects.toMatchObject({ code: 'SQLITE_BUSY' });
    });

    // A deferred BEGIN would have let the second transaction start and read,
    // failing only at its first write — the read-then-decide window the hold
    // rules must not have.
    expect(secondStarted).toBe(false);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- src/infrastructure/persistence.integration.test.ts`
Expected: FAIL. `secondStarted` is `true` (Kysely's deferred `begin`), or the `createDb` options argument is a type error.

- [ ] **Step 3: Implement**

Replace `apps/api/src/infrastructure/db/createDb.ts` with:

```ts
import SqliteDatabase from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.js';

export interface CreateDbOptions {
  /**
   * How long a connection waits for another's write lock before failing
   * with SQLITE_BUSY. better-sqlite3's own default is 5000 ms. The wait is
   * synchronous, so it only helps against *another process*; within one
   * process every transaction already queues on the single connection.
   */
  busyTimeoutMs?: number;
}

export function createDb(path: string, options: CreateDbOptions = {}): Kysely<Database> {
  const sqlite = new SqliteDatabase(path, { timeout: options.busyTimeoutMs ?? 5000 });
  sqlite.pragma('journal_mode = WAL');
  // Enforce referential integrity explicitly rather than relying on
  // whatever a given better-sqlite3 build's compiled-in default happens
  // to be (it varies by build) — the schema's foreign keys must be
  // real constraints the database checks, not just documentation.
  sqlite.pragma('foreign_keys = ON');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}
```

Create `apps/api/src/infrastructure/db/immediateTransaction.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Database } from './schema.js';

/**
 * Runs `fn` in a transaction opened with BEGIN IMMEDIATE, which takes
 * SQLite's write lock up front instead of at the first write. Kysely's own
 * `transaction()` issues a plain, deferred `begin`, under which two writers
 * can both read, both decide, and only discover each other when one writes
 * — the read-then-append window that availability and the hold cap
 * (ADR-0046) must not have (backend architecture: "BEGIN IMMEDIATE
 * serializes the read-then-append"). Pinned to one connection, as a
 * transaction must be.
 */
export async function inImmediateTransaction<T>(db: Kysely<Database>, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  return db.connection().execute(async (conn) => {
    await sql`begin immediate`.execute(conn);
    try {
      const result = await fn(conn);
      await sql`commit`.execute(conn);
      return result;
    } catch (err) {
      await sql`rollback`.execute(conn);
      throw err;
    }
  });
}
```

In `apps/api/src/infrastructure/UnitOfWorkKysely.ts`, add `import { inImmediateTransaction } from './db/immediateTransaction.js';` and replace `execute` with:

```ts
  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return inImmediateTransaction(this.db, (trx) => fn({
      wishlists: new WishlistRepositoryKysely(trx),
      holds: new HoldRepositoryKysely(trx),
      eventStore: this.wrapEventStore(new EventStoreKysely(trx)),
    }));
  }
```

- [ ] **Step 4: Run, then commit**

Run: `npm run lint && npm test`
Expected: PASS, including the commit and rollback tests above it.

```bash
git add apps/api/src/infrastructure
git commit -m "feat(api): units of work begin with BEGIN IMMEDIATE

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 4.4: Concurrency — N parallel holds on a quantity-1 item

Driven over HTTP so the test survives PR 5's internal signature changes. It goes through the real composition root and real SQLite.

**Files:**
- Create: `apps/api/src/presentation/concurrency.integration.test.ts`

**Interfaces:**
- Consumes: `buildDependencies`, `buildApp`, `createDb`, `migrateToLatest`.

- [ ] **Step 1: Write the test**

Create `apps/api/src/presentation/concurrency.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import type { Database } from '../infrastructure/db/schema.js';
import type { Logger } from '../application/ports/Logger.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';

const silent: Logger = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };
const N = 10;

let db: Kysely<Database>;
let app: FastifyInstance;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  app = buildApp(buildDependencies(db, silent), { cookieSecret: 'test-secret' });
  disposeWithApp(app, db);
});

afterEach(async () => {
  await app.close();
});

function cookieOf(response: LightMyRequestResponse): string {
  const setCookie = response.headers['set-cookie'];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
}

async function listWithGuests(guests: number) {
  const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } }))
    .json() as { slug: string; key: string; itemId: string };
  const cookies: string[] = [];
  for (let i = 0; i < guests; i += 1) {
    cookies.push(cookieOf(await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } })));
  }
  return { list, cookies };
}

describe('concurrency on a quantity-1 item (testing spec)', () => {
  it(`lets exactly one of ${N} parallel holds from different guests through`, async () => {
    const { list, cookies } = await listWithGuests(N);

    const responses = await Promise.all(cookies.map((cookie, i) => app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: `tap-${i}` },
    })));

    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, ...Array(N - 1).fill(409)]);
    expect(await db.selectFrom('holds').select('id').execute()).toHaveLength(1);
    expect(await db.selectFrom('event_log').select('id').execute()).toHaveLength(1);
  });

  it('turns a parallel double submit of one key into one hold, answered twice (ADR-0048)', async () => {
    const { list, cookies: [cookie] } = await listWithGuests(1);
    const submit = () => app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'same-tap' },
    });

    const [first, second] = await Promise.all([submit(), submit()]);

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(second.json()).toEqual(first.json());
    expect(await db.selectFrom('holds').select('id').execute()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test --workspace=apps/api -- src/presentation/concurrency.integration.test.ts`
Expected: PASS. Both cases already hold, since each unit of work is atomic under `BEGIN IMMEDIATE` on the one connection. This is a regression guard; if it fails, something reads outside the unit of work.

- [ ] **Step 3: Verify the guard bites**

Temporarily move `const existing = await ctx.holds.findByIdempotencyKey(...)` and its `if` in `HoldItem.ts` *after* the `wishlist.holdItem(...)` call. Run the test again and expect the double-submit case to FAIL: the second submit gets 409 because the first hold already took the unit. Revert the change, re-run, and expect PASS.

- [ ] **Step 4: Commit and open PR 4**

```bash
git add apps/api/src/presentation/concurrency.integration.test.ts
git commit -m "test(api): N parallel holds on a quantity-1 item let exactly one through

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
npm run build && npm run test:e2e
git push -u origin feat/holds-a/04-persistence
```

Open the PR against `feat/holds-a/03-domain-lifecycle`, with the "recreate dev databases" line, since `active_holds` is gone.

---

## PR 5 — application: the lifecycle use cases (`feat/holds-a/05-use-cases`, base `feat/holds-a/04-persistence`)

```bash
git switch -c feat/holds-a/05-use-cases feat/holds-a/04-persistence
```

The new use cases are tested here with the in-memory fakes; PR 6 wires them to routes. `HoldItem` moves onto `AccessContext` here, so its route changes by a few lines.

### Task 5.1: `HoldPolicy`, `AccessContext` and the hold view

**Files:**
- Create: `apps/api/src/application/HoldPolicy.ts`
- Create: `apps/api/src/application/AccessContext.ts`
- Create: `apps/api/src/application/views/HoldView.ts`
- Test: `apps/api/src/application/views/HoldView.test.ts`

**Interfaces:**
- Consumes: `Hold.statusAt/canExtendAt/canReleaseAt`, `Wishlist.canPurchaseHold`.
- Produces:
  - `interface HoldPolicy { durationDays: number }`
  - `DEFAULT_HOLD_POLICY: HoldPolicy` (`durationDays: 3`)
  - `holdDurationMs(policy: HoldPolicy): number`
  - `interface AccessContext { guestSession: { sessionHash: string } | null }`
  - `interface HoldView { holdId: string; itemId: string; status: HoldStatus; expiresAt: string; extendedAt: string | null; actions: { extend: boolean; release: boolean; purchase: boolean } }`
  - `toHoldView(wishlist: Wishlist, hold: Hold, now: Date): HoldView`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/application/views/HoldView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toHoldView } from './HoldView.js';
import { Hold } from '../../domain/entities/Hold.js';
import { Item } from '../../domain/entities/Item.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

let count = 0;
function holdOn(overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}): Hold {
  count += 1;
  return Hold.reconstitute({
    id: `00000000-0000-7000-8000-${String(count).padStart(12, '0')}`, itemId: ITEM_ID, secret: 's', sessionHash: 'a'.repeat(64),
    idempotencyKey: `idem-${count}`, expiresAt: at(3 * DAY), extendedAt: null, releasedAt: null, purchasedAt: null, ...overrides,
  });
}

function wishlistWith(activeHolds: Hold[] = []): Wishlist {
  const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 0, purchasedCount: 0 });
  return Wishlist.reconstitute({ id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'o', key: 'k', keyGen: 1, item, activeHolds });
}

describe('toHoldView — the domain decides which actions the guest is offered', () => {
  it('shows an active, never-extended hold with every action open', () => {
    const hold = holdOn();
    expect(toHoldView(wishlistWith([hold]), hold, T0)).toEqual({
      holdId: hold.id.value, itemId: ITEM_ID, status: 'active',
      expiresAt: at(3 * DAY).toISOString(), extendedAt: null,
      actions: { extend: true, release: true, purchase: true },
    });
  });

  it('closes extend once the hold has used its one extension', () => {
    const hold = holdOn({ extendedAt: at(DAY) });
    const view = toHoldView(wishlistWith([hold]), hold, at(DAY));
    expect(view.extendedAt).toBe(at(DAY).toISOString());
    expect(view.actions).toEqual({ extend: false, release: true, purchase: true });
  });

  it('offers only purchase on an expired hold while a unit is free (D15)', () => {
    const hold = holdOn({ expiresAt: at(-1) });
    const view = toHoldView(wishlistWith(), hold, T0);
    expect(view.status).toBe('expired');
    expect(view.actions).toEqual({ extend: false, release: false, purchase: true });
  });

  it('offers nothing on an expired hold whose unit someone else now holds', () => {
    const view = toHoldView(wishlistWith([holdOn({ sessionHash: 'b'.repeat(64) })]), holdOn({ expiresAt: at(-1) }), T0);
    expect(view.actions).toEqual({ extend: false, release: false, purchase: false });
  });

  it.each([
    ['released', { releasedAt: T0 }],
    ['purchased', { purchasedAt: T0 }],
  ] as const)('offers nothing on a %s hold', (status, overrides) => {
    const view = toHoldView(wishlistWith(), holdOn(overrides), T0);
    expect(view.status).toBe(status);
    expect(view.actions).toEqual({ extend: false, release: false, purchase: false });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- src/application/views`
Expected: FAIL. `./HoldView.js` cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/api/src/application/HoldPolicy.ts`:

```ts
/**
 * Operator-configured hold rules, validated into this shape at the
 * composition root (holds-lifecycle §3). Stack C adds
 * `maxActiveHoldsPerSession`.
 */
export interface HoldPolicy {
  /** HOLD_DURATION_DAYS (ops, default 3). The one extension adds the same again (ADR-0002). */
  durationDays: number;
}

export const DEFAULT_HOLD_POLICY: HoldPolicy = { durationDays: 3 };

const DAY_MS = 24 * 60 * 60 * 1000;

export function holdDurationMs(policy: HoldPolicy): number {
  return policy.durationDays * DAY_MS;
}
```

Create `apps/api/src/application/AccessContext.ts`:

```ts
/**
 * The credentials a request presented for one wishlist, already verified
 * (holds-lifecycle §3, D7). Built only in presentation/accessContext.ts —
 * authentication is the edge's job — and passed to use cases beside, never
 * inside, the TransactionContext: the transaction is database-scoped, this
 * is request-scoped. The guest session arrives already hashed, so the raw
 * session id never crosses into application/.
 *
 * Structurally a `HoldCredentials` (domain/policies/HoldPermissions), which
 * is how the domain policy reads it. Stack B adds `owner`, stack E
 * `guestHoldSignature`.
 */
export interface AccessContext {
  guestSession: { sessionHash: string } | null;
}
```

Create `apps/api/src/application/views/HoldView.ts`:

```ts
import type { Hold, HoldStatus } from '../../domain/entities/Hold.js';
import type { Wishlist } from '../../domain/entities/Wishlist.js';

/** A hold as its own guest sees it. Mirrors `holdViewSchema` in @gubbins/shared-types, which validates it on the way out. */
export interface HoldView {
  holdId: string;
  itemId: string;
  status: HoldStatus;
  expiresAt: string;
  extendedAt: string | null;
  /**
   * What the guest may do next, decided by the domain so the UI never
   * re-derives a rule: extend once while active, release while active,
   * purchase while active or — D15 — while expired with a unit still free.
   */
  actions: { extend: boolean; release: boolean; purchase: boolean };
}

export function toHoldView(wishlist: Wishlist, hold: Hold, now: Date): HoldView {
  return {
    holdId: hold.id.value,
    itemId: hold.itemId.value,
    status: hold.statusAt(now),
    expiresAt: hold.expiresAt.toISOString(),
    extendedAt: hold.extendedAt?.toISOString() ?? null,
    actions: {
      extend: hold.canExtendAt(now),
      release: hold.canReleaseAt(now),
      purchase: wishlist.canPurchaseHold(hold, now),
    },
  };
}
```

- [ ] **Step 4: Run, then commit**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS.

```bash
git add apps/api/src/application
git commit -m "feat(api): HoldPolicy, AccessContext and the hold view the domain fills in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 5.2: Retry a unit of work that loses a concurrency race

**Files:**
- Create: `apps/api/src/application/RetryingUnitOfWork.ts`
- Test: `apps/api/src/application/RetryingUnitOfWork.test.ts`
- Modify: `apps/api/src/presentation/compositionRoot.ts`

**Interfaces:**
- Produces:
  - `class RetryingUnitOfWork implements UnitOfWork { constructor(inner: UnitOfWork, options?: RetryOptions) }`
  - `interface RetryOptions { retries: number; sleep(ms: number): Promise<void>; random(): number }`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/application/RetryingUnitOfWork.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RetryingUnitOfWork, type RetryOptions } from './RetryingUnitOfWork.js';
import type { TransactionContext, UnitOfWork } from './ports/UnitOfWork.js';
import { ConcurrencyError } from '../domain/errors.js';

/** A unit of work that fails with each given error in turn, then runs the callback. */
function failingThen(errors: Error[]) {
  let calls = 0;
  const unitOfWork: UnitOfWork = {
    execute: async (fn) => {
      const error = errors[calls];
      calls += 1;
      if (error) throw error;
      return fn({} as TransactionContext);
    },
  };
  return { unitOfWork, calls: () => calls };
}

const conflict = () => new ConcurrencyError('item-1', 0, 1);

function instant(sleeps: number[]): RetryOptions {
  return { retries: 3, sleep: async (ms) => { sleeps.push(ms); }, random: () => 0.5 };
}

describe('RetryingUnitOfWork (data & persistence: retry cap 3 with jitter)', () => {
  it('runs the unit of work once when it succeeds', async () => {
    const { unitOfWork, calls } = failingThen([]);
    await expect(new RetryingUnitOfWork(unitOfWork, instant([])).execute(async () => 'done')).resolves.toBe('done');
    expect(calls()).toBe(1);
  });

  it('re-runs the whole unit of work after a conflict, waiting a jittered, doubling interval', async () => {
    const sleeps: number[] = [];
    const { unitOfWork, calls } = failingThen([conflict(), conflict()]);

    await expect(new RetryingUnitOfWork(unitOfWork, instant(sleeps)).execute(async () => 'done')).resolves.toBe('done');

    expect(calls()).toBe(3);
    expect(sleeps).toEqual([5, 10]);
  });

  it('gives up after 3 retries and rethrows the conflict', async () => {
    const sleeps: number[] = [];
    const { unitOfWork, calls } = failingThen([conflict(), conflict(), conflict(), conflict()]);

    await expect(new RetryingUnitOfWork(unitOfWork, instant(sleeps)).execute(async () => 'done')).rejects.toThrow(ConcurrencyError);

    expect(calls()).toBe(4);
    expect(sleeps).toEqual([5, 10, 20]);
  });

  it('never retries any other failure', async () => {
    const { unitOfWork, calls } = failingThen([new Error('boom')]);
    await expect(new RetryingUnitOfWork(unitOfWork, instant([])).execute(async () => 'done')).rejects.toThrow('boom');
    expect(calls()).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- src/application/RetryingUnitOfWork.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/api/src/application/RetryingUnitOfWork.ts`:

```ts
import { ConcurrencyError } from '../domain/errors.js';
import type { TransactionContext, UnitOfWork } from './ports/UnitOfWork.js';

export interface RetryOptions {
  /** Retries after the first attempt. The data & persistence spec caps them at 3. */
  retries: number;
  /** Waits before a retry; injected so tests need not sleep. */
  sleep(ms: number): Promise<void>;
  /** Jitter source in [0, 1). */
  random(): number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  retries: 3,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/**
 * Re-runs a whole unit of work when it loses an optimistic-concurrency race
 * (data & persistence: "losing writer retries against fresh state and
 * re-evaluates the policy. Retry cap 3 with jitter."). The callback runs
 * again from the top, so it reloads the aggregate and decides afresh — a
 * retry never replays a stale decision. Any other failure passes straight
 * through.
 *
 * Under BEGIN IMMEDIATE on one connection a conflict should not arise at
 * all; this guards the case where one does (another process on the file).
 */
export class RetryingUnitOfWork implements UnitOfWork {
  constructor(
    private inner: UnitOfWork,
    private options: RetryOptions = DEFAULT_OPTIONS,
  ) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.inner.execute(fn);
      } catch (err) {
        if (!(err instanceof ConcurrencyError) || attempt >= this.options.retries) throw err;
        // Full jitter over a doubling window: up to 10, 20, then 40 ms.
        await this.options.sleep(Math.floor(this.options.random() * 10 * 2 ** attempt));
      }
    }
  }
}
```

In `apps/api/src/presentation/compositionRoot.ts`, add `import { RetryingUnitOfWork } from '../application/RetryingUnitOfWork.js';` and change the unit-of-work line to:

```ts
  const unitOfWork = new RetryingUnitOfWork(new UnitOfWorkKysely(db, (base) => new LoggingEventStore(base, logger)));
```

- [ ] **Step 4: Run, then commit**

Run: `npm run lint && npm test`
Expected: PASS. The routes test that stubs `holdItem` to throw `ConcurrencyError` still gets 409, because the stub sits above the unit of work.

```bash
git add apps/api/src
git commit -m "feat(api): retry a unit of work up to 3 times with jitter when it loses a race

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 5.3: `HoldItem` takes an `AccessContext` and the configured duration, and returns a hold view

**Files:**
- Create: `apps/api/src/presentation/accessContext.ts`, `accessContext.test.ts`
- Modify: `apps/api/src/application/use-cases/HoldItem.ts`, `HoldItem.test.ts`
- Modify: `apps/api/src/presentation/routes.ts`, `compositionRoot.ts`, `openApiDocument.ts`

**Interfaces:**
- Consumes: Task 5.1 (`AccessContext`, `HoldPolicy`, `toHoldView`), Task 5.2.
- Produces:
  - `HoldItem.execute(input: { wishlistId: string; itemId: string; idempotencyKey: string }, access: AccessContext): Promise<HoldView>`
  - constructor `(unitOfWork, tokenGenerator, clock, hasher, policy: HoldPolicy)`
  - `SESSION_COOKIE`, `SessionPayload`, `readSession(request, wishlist)`, `buildAccessContext(request: FastifyRequest, wishlist: Wishlist, hasher: Hasher): AccessContext` (all in `presentation/accessContext.ts`)
  - `buildDependencies(db, logger?, options?: BuildDependenciesOptions)` with `interface BuildDependenciesOptions { clock?: Clock; holdPolicy?: HoldPolicy }`
  - `AppDependencies.hasher: Hasher`

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/application/use-cases/HoldItem.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { HoldItem } from './HoldItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { InMemoryUnitOfWork, inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../HoldPolicy.js';
import { RetryingUnitOfWork } from '../RetryingUnitOfWork.js';
import type { AccessContext } from '../AccessContext.js';
import type { EventStore } from '../ports/EventStore.js';
import { ConcurrencyError, ItemNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00Z');
const DAY = 86_400_000;
const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };
const OTHER_GUEST: AccessContext = { guestSession: { sessionHash: 'b'.repeat(64) } };

async function makeUseCase(policy: HoldPolicy = DEFAULT_HOLD_POLICY) {
  const persistence = inMemoryPersistence();
  await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
  const useCase = new HoldItem(persistence.unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new FakeHasher(), policy);
  return { useCase, ...persistence };
}

const input = (idempotencyKey = 'idem-1') => ({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, idempotencyKey });

describe('HoldItem', () => {
  it('holds an available item for the configured duration and returns its view', async () => {
    const { useCase } = await makeUseCase();

    expect(await useCase.execute(input(), GUEST)).toMatchObject({
      itemId: ITEM_ID, status: 'active', expiresAt: '2026-01-04T00:00:00.000Z', extendedAt: null,
      actions: { extend: true, release: true, purchase: true },
    });
  });

  it('reads HOLD_DURATION_DAYS from the policy', async () => {
    const { useCase } = await makeUseCase({ durationDays: 1 });
    expect((await useCase.execute(input(), GUEST)).expiresAt).toBe(new Date(NOW.getTime() + DAY).toISOString());
  });

  it("stores the hold under the session's hash, as presentation computed it", async () => {
    const { useCase, holds } = await makeUseCase();
    await useCase.execute(input(), GUEST);
    expect((await holds.findByIdempotencyKey(ITEM_ID, 'idem-1'))?.sessionHash.value).toBe('a'.repeat(64));
  });

  it('appends ItemHeld to the item stream as the guest (ADR-0075)', async () => {
    const { useCase, eventStore } = await makeUseCase();
    await useCase.execute(input(), GUEST);
    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest']]);
  });

  it('replays the original hold for a repeated idempotency key instead of creating a second', async () => {
    const { useCase, eventStore } = await makeUseCase();
    const first = await useCase.execute(input(), GUEST);
    expect(await useCase.execute(input(), GUEST)).toEqual(first);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(1);
  });

  it('throws ItemUnavailableError for a second, different hold on a held item', async () => {
    const { useCase } = await makeUseCase();
    await useCase.execute(input(), GUEST);
    await expect(useCase.execute(input('idem-2'), OTHER_GUEST)).rejects.toThrow(ItemUnavailableError);
  });

  it('throws ItemNotFoundError without a guest session, for an unknown wishlist, or an item not on it', async () => {
    const { useCase } = await makeUseCase();
    await expect(useCase.execute(input(), { guestSession: null })).rejects.toThrow(ItemNotFoundError);
    await expect(useCase.execute({ ...input(), wishlistId: 'no-such-wishlist' }, GUEST)).rejects.toThrow(ItemNotFoundError);
    await expect(useCase.execute({ ...input(), itemId: '44444444-4444-7444-8444-444444444444' }, GUEST)).rejects.toThrow(ItemNotFoundError);
  });

  it('is re-run from the top when it loses a concurrency race, and succeeds against fresh state', async () => {
    const persistence = inMemoryPersistence();
    await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    let conflictsLeft = 2;
    const flaky: EventStore = {
      append: async (itemId, expectedSeq, events, actor) => {
        if (conflictsLeft > 0) { conflictsLeft -= 1; throw new ConcurrencyError(itemId, expectedSeq, expectedSeq + 1); }
        return persistence.eventStore.append(itemId, expectedSeq, events, actor);
      },
    };
    const unitOfWork = new RetryingUnitOfWork(
      new InMemoryUnitOfWork({ wishlists: persistence.wishlists, holds: persistence.holds, eventStore: flaky }),
      { retries: 3, sleep: async () => {}, random: () => 0 },
    );
    const useCase = new HoldItem(unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new FakeHasher(), DEFAULT_HOLD_POLICY);

    await expect(useCase.execute(input(), GUEST)).resolves.toMatchObject({ status: 'active' });
    expect(persistence.eventStore.recorded(ITEM_ID)).toHaveLength(1);
  });
});
```

Create `apps/api/src/presentation/accessContext.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { buildAccessContext, SESSION_COOKIE } from './accessContext.js';
import { HasherSha256 } from '../infrastructure/HasherSha256.js';
import { aWishlist } from '../application/test-fakes/builders.js';

const wishlist = aWishlist().build();

function requestWith(cookie: string | undefined, unsigned: { valid: boolean; value: string | null }): FastifyRequest {
  return {
    cookies: cookie === undefined ? {} : { [SESSION_COOKIE]: cookie },
    unsignCookie: () => unsigned,
  } as unknown as FastifyRequest;
}

const payload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ wishlistId: wishlist.id.value, keyGen: wishlist.keyGen, sessionId: 'session-abc', ...overrides });

describe('buildAccessContext — the one place a request becomes credentials (D7)', () => {
  it('hashes a valid session for this list, so the raw session id goes no further', () => {
    const access = buildAccessContext(requestWith('signed', { valid: true, value: payload() }), wishlist, new HasherSha256());

    expect(access).toEqual({ guestSession: { sessionHash: createHash('sha256').update('session-abc').digest('hex') } });
    expect(JSON.stringify(access)).not.toContain('session-abc');
  });

  it.each([
    ['no cookie', requestWith(undefined, { valid: false, value: null })],
    ['a cookie with a bad signature', requestWith('forged', { valid: false, value: null })],
    ['a session for another list', requestWith('signed', { valid: true, value: payload({ wishlistId: '22222222-2222-7222-8222-222222222222' }) })],
    ['a session from before the key was rotated', requestWith('signed', { valid: true, value: payload({ keyGen: 0 }) })],
    ['a payload without a session id', requestWith('signed', { valid: true, value: payload({ sessionId: undefined }) })],
    ['a cookie that is not JSON', requestWith('signed', { valid: true, value: 'not json' })],
  ])('gives no guest credential for %s', (_name, request) => {
    expect(buildAccessContext(request, wishlist, new HasherSha256())).toEqual({ guestSession: null });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test --workspace=apps/api -- HoldItem accessContext`
Expected: FAIL. `./accessContext.js` cannot be resolved, and `HoldItem` does not accept a policy or an access context.

- [ ] **Step 3: Implement `buildAccessContext`**

Create `apps/api/src/presentation/accessContext.ts`:

```ts
import type { FastifyRequest } from 'fastify';
import type { AccessContext } from '../application/AccessContext.js';
import type { Hasher } from '../application/ports/Hasher.js';
import type { Wishlist } from '../domain/entities/Wishlist.js';

export const SESSION_COOKIE = 'gubbins_session';

export interface SessionPayload {
  wishlistId: string;
  keyGen: number;
  sessionId: string;
}

/**
 * The signed session cookie's payload, if it is valid for *this* wishlist
 * at its current key generation — a session from before a key rotation, or
 * for another list, counts as no session at all.
 */
export function readSession(request: FastifyRequest, wishlist: Wishlist): SessionPayload | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const payload = JSON.parse(unsigned.value) as Partial<SessionPayload>;
    if (payload.wishlistId !== wishlist.id.value || payload.keyGen !== wishlist.keyGen) return null;
    if (typeof payload.sessionId !== 'string') return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * The one place a request's credentials become an AccessContext
 * (holds-lifecycle D7). The session id is hashed here, so application/
 * only ever sees the hash that `holds.session_hash` stores — never the raw
 * value (holds spec).
 */
export function buildAccessContext(request: FastifyRequest, wishlist: Wishlist, hasher: Hasher): AccessContext {
  const session = readSession(request, wishlist);
  return { guestSession: session ? { sessionHash: hasher.hash(session.sessionId) } : null };
}
```

- [ ] **Step 4: Move `HoldItem` onto it**

Replace `apps/api/src/application/use-cases/HoldItem.ts` with:

```ts
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import type { AccessContext } from '../AccessContext.js';
import { holdDurationMs, type HoldPolicy } from '../HoldPolicy.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';
import { ItemNotFoundError } from '../../domain/errors.js';

export interface HoldItemInput {
  wishlistId: string;
  itemId: string;
  idempotencyKey: string;
}

export class HoldItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
    /** Only for the ItemHeld secret hash until stack E; session hashing happens in presentation now. */
    private hasher: Hasher,
    private policy: HoldPolicy,
  ) {}

  async execute(input: HoldItemInput, access: AccessContext): Promise<HoldView> {
    const guest = access.guestSession;
    // Only a keyed-in guest may hold (holds-lifecycle §3). Presentation
    // already answers a missing session with the generic 404; this keeps the
    // use case safe on its own, failing the same way.
    if (!guest) throw new ItemNotFoundError(input.itemId);

    return this.unitOfWork.execute(async (ctx) => {
      // Read once: the aggregate's active holds are loaded as of this
      // instant, and every decision below is taken at the same one.
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new ItemNotFoundError(input.itemId);
      wishlist.getItem(input.itemId);

      // Deliberately before the availability check: a replayed idempotency
      // key must return the original hold (its current view), not trip
      // ItemUnavailableError on the hold it created itself.
      const existing = await ctx.holds.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) return toHoldView(wishlist, existing, now);

      const { hold, item, event, expectedSeq } = wishlist.holdItem({
        itemId: input.itemId,
        sessionHash: guest.sessionHash,
        idempotencyKey: input.idempotencyKey,
        now,
        durationMs: holdDurationMs(this.policy),
      }, this.tokenGenerator, this.hasher);

      // Placing a hold is guest-only (ADR-0075), so the actor is fixed.
      await ctx.eventStore.append(item.id.value, expectedSeq, [event], 'guest');
      await ctx.holds.insert(hold);
      // Persist exactly what the domain decided (roadmap open item 2).
      await ctx.wishlists.saveItemState(item);

      return toHoldView(wishlist, hold, now);
    });
  }
}
```

In `apps/api/src/presentation/compositionRoot.ts`:

```ts
import type { Clock } from '../application/ports/Clock.js';
import type { Hasher } from '../application/ports/Hasher.js';
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../application/HoldPolicy.js';

export interface BuildDependenciesOptions {
  /** Defaults to the system clock; integration tests pass a FixedClock to step through expiry. */
  clock?: Clock;
  /** Validated from HOLD_DURATION_DAYS by the server (holdPolicyConfig.ts); defaults to 3 days. */
  holdPolicy?: HoldPolicy;
}
```

- Add `hasher: Hasher;` to `AppDependencies`.
- Change the signature to `export function buildDependencies(db: Kysely<Database>, logger: Logger = new ConsoleLogger(), options: BuildDependenciesOptions = {}): AppDependencies`.
- Replace `const clock = new ClockSystem();` with `const clock = options.clock ?? new ClockSystem();` and add `const holdPolicy = options.holdPolicy ?? DEFAULT_HOLD_POLICY;`.
- Construct `new HoldItem(unitOfWork, tokenGenerator, clock, hasher, holdPolicy)`.
- Add `hasher,` to the returned object.

In `openApiDocument.ts`, add `hasher: unusedDependency('hasher'),`.

In `apps/api/src/presentation/routes.ts`:
- Delete `SESSION_COOKIE`, `interface SessionPayload` and `readSession`.
- Import instead: `import { SESSION_COOKIE, buildAccessContext, type SessionPayload } from './accessContext.js';`.
- In the GET handler, replace `const session = readSession(request, wishlist);` and its `if (!session)` line with:

```ts
    const access = buildAccessContext(request, wishlist, deps.hasher);
    if (!access.guestSession) return reply.code(404).send(NOT_FOUND);
```

- In the hold handler, do the same, then replace the `execute` call and the success reply with:

```ts
      const view = await deps.holdItem.execute({ wishlistId: wishlist.id.value, itemId, idempotencyKey: request.body.idempotencyKey }, access);
      // PR 6 widens the response to the full hold view; until then, the skeleton's three fields.
      return reply.code(201).send({ holdId: view.holdId, itemId: view.itemId, expiresAt: view.expiresAt });
```

- [ ] **Step 5: Run everything, then commit**

Run: `npm run lint && npm test && npm run build`
Expected: PASS. `routes.integration.test.ts` is unchanged and green, since the HTTP contract has not moved.

```bash
git add apps/api/src
git commit -m "feat(api): HoldItem takes an AccessContext and the configured hold duration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 5.4: `ExtendHold`

**Files:**
- Create: `apps/api/src/application/test-fakes/scenarios.ts`
- Create: `apps/api/src/application/use-cases/holdCommand.ts`
- Create: `apps/api/src/application/use-cases/ExtendHold.ts`, `ExtendHold.test.ts`

**Interfaces:**
- Consumes: `HoldPermissions`, `Wishlist.extendHold/findHold/owns`, `toHoldView`, `holdDurationMs`.
- Produces:
  - `interface HoldCommandInput { wishlistId: string; holdId: string }`
  - `interface HoldCommand { execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> }`
  - `findOwnedHold(ctx: TransactionContext, wishlist: Wishlist, holdId: string): Promise<Hold>`
  - `class ExtendHold implements HoldCommand`, constructor `(unitOfWork: UnitOfWork, clock: Clock, policy: HoldPolicy)`
  - `twoListsWithOneItemEach(policy?)` returning `{ store; wishlists; holds; eventStore; unitOfWork; clock: FixedClock; policy; placeHold(access?, onOtherList?): Promise<HoldView> }`, plus `GUEST`, `OTHER_GUEST`, `NO_SESSION`, `WISHLIST_ID`, `ITEM_ID`, `OTHER_WISHLIST_ID`, `OTHER_ITEM_ID`, `T0`, `DAY` (test-only)

- [ ] **Step 1: Write the shared test scenario**

Create `apps/api/src/application/test-fakes/scenarios.ts`:

```ts
import type { AccessContext } from '../AccessContext.js';
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../HoldPolicy.js';
import { HoldItem } from '../use-cases/HoldItem.js';
import { aWishlist } from './builders.js';
import { FakeHasher } from './FakeHasher.js';
import { FixedClock } from './FixedClock.js';
import { inMemoryPersistence } from './InMemoryRepositories.js';
import { SequentialTokenGenerator } from './SequentialTokenGenerator.js';

export const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
export const ITEM_ID = '33333333-3333-7333-8333-333333333333';
export const OTHER_WISHLIST_ID = '22222222-2222-7222-8222-222222222222';
export const OTHER_ITEM_ID = '44444444-4444-7444-8444-444444444444';
export const T0 = new Date('2026-01-01T00:00:00.000Z');
export const DAY = 24 * 60 * 60 * 1000;

export const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };
export const OTHER_GUEST: AccessContext = { guestSession: { sessionHash: 'b'.repeat(64) } };
export const NO_SESSION: AccessContext = { guestSession: null };

/**
 * Two one-item lists in one in-memory store, a clock at T0, and a HoldItem
 * to place holds through — the starting point the hold-command tests share.
 * List A is the one under test; list B exists so every command can be shown
 * refusing a hold from a list it was not loaded for (IDOR).
 */
export async function twoListsWithOneItemEach(policy: HoldPolicy = DEFAULT_HOLD_POLICY) {
  const persistence = inMemoryPersistence();
  const clock = new FixedClock(T0);
  await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
  await persistence.wishlists.insert(
    aWishlist().withId(OTHER_WISHLIST_ID).withSlug('def456').withItem({ id: OTHER_ITEM_ID, title: 'Toaster' }).build(),
  );
  const holdItem = new HoldItem(persistence.unitOfWork, new SequentialTokenGenerator(), clock, new FakeHasher(), policy);
  let taps = 0;

  /** Places a hold on list A's item — or list B's, with `onOtherList` — as `access`. */
  function placeHold(access: AccessContext = GUEST, onOtherList = false) {
    taps += 1;
    const target = onOtherList ? { wishlistId: OTHER_WISHLIST_ID, itemId: OTHER_ITEM_ID } : { wishlistId: WISHLIST_ID, itemId: ITEM_ID };
    return holdItem.execute({ ...target, idempotencyKey: `tap-${taps}` }, access);
  }

  return { ...persistence, clock, policy, placeHold };
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/application/use-cases/ExtendHold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ExtendHold } from './ExtendHold.js';
import type { HoldPolicy } from '../HoldPolicy.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, T0, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { HoldAlreadyExtendedError, HoldNotActiveError, HoldNotFoundError } from '../../domain/errors.js';

async function setup(policy?: HoldPolicy) {
  const world = await twoListsWithOneItemEach(policy);
  const useCase = new ExtendHold(world.unitOfWork, world.clock, world.policy);
  const extend = (holdId: string, access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  return { ...world, extend };
}

const iso = (msFromT0: number) => new Date(T0.getTime() + msFromT0).toISOString();

describe('ExtendHold', () => {
  it('adds the duration to the current expiry, not to now, and returns the updated view', async () => {
    const { placeHold, clock, extend } = await setup();
    const { holdId } = await placeHold();
    clock.advance(DAY);

    expect(await extend(holdId)).toMatchObject({
      holdId, status: 'active', expiresAt: iso(6 * DAY), extendedAt: iso(DAY),
      actions: { extend: false, release: true, purchase: true },
    });
  });

  it('persists the extension and records HoldExtended as the guest on the item stream', async () => {
    const { placeHold, extend, holds, eventStore, wishlists } = await setup();
    const { holdId } = await placeHold();

    await extend(holdId);

    expect((await holds.findById(holdId))?.extendedAt).toEqual(T0);
    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest'], ['HoldExtended', 'guest']]);
    expect((await wishlists.findById(WISHLIST_ID, T0))?.item?.seq).toBe(2);
  });

  it('extends by the configured HOLD_DURATION_DAYS', async () => {
    const { placeHold, extend } = await setup({ durationDays: 1 });
    const { holdId } = await placeHold();
    expect((await extend(holdId)).expiresAt).toBe(iso(2 * DAY));
  });

  it('extends at the very instant the hold expires', async () => {
    const { placeHold, clock, extend } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY);
    await expect(extend(holdId)).resolves.toMatchObject({ status: 'active' });
  });

  it('refuses a second extension and appends nothing', async () => {
    const { placeHold, extend, eventStore } = await setup();
    const { holdId } = await placeHold();
    await extend(holdId);

    await expect(extend(holdId)).rejects.toThrow(HoldAlreadyExtendedError);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(2);
  });

  it('refuses a hold that has expired', async () => {
    const { placeHold, clock, extend } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY + 1);
    await expect(extend(holdId)).rejects.toThrow(HoldNotActiveError);
  });

  it.each([
    ['another guest', OTHER_GUEST],
    ['a caller with no session', NO_SESSION],
  ])('treats %s as if the hold did not exist', async (_who, access) => {
    const { placeHold, extend } = await setup();
    const { holdId } = await placeHold();
    await expect(extend(holdId, access)).rejects.toThrow(HoldNotFoundError);
  });

  it('treats an unknown or malformed hold id as not found', async () => {
    const { extend } = await setup();
    await expect(extend('00000000-0000-7000-8000-999999999999')).rejects.toThrow(HoldNotFoundError);
    await expect(extend('not-a-uuid')).rejects.toThrow(HoldNotFoundError);
  });

  it('treats a hold from another list as not found (IDOR)', async () => {
    const { placeHold, extend } = await setup();
    const { holdId } = await placeHold(GUEST, true);
    await expect(extend(holdId)).rejects.toThrow(HoldNotFoundError);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- ExtendHold`
Expected: FAIL. `./ExtendHold.js` cannot be resolved.

- [ ] **Step 4: Implement**

Create `apps/api/src/application/use-cases/holdCommand.ts`:

```ts
import type { Hold } from '../../domain/entities/Hold.js';
import type { Wishlist } from '../../domain/entities/Wishlist.js';
import { HoldNotFoundError } from '../../domain/errors.js';
import type { AccessContext } from '../AccessContext.js';
import type { TransactionContext } from '../ports/UnitOfWork.js';
import type { HoldView } from '../views/HoldView.js';

export interface HoldCommandInput {
  wishlistId: string;
  holdId: string;
}

/** Extend, release and mark purchased share one shape, so presentation registers their routes alike. */
export interface HoldCommand {
  execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView>;
}

/**
 * Resolves `holdId` to a hold on this wishlist, or throws HoldNotFoundError.
 * An active hold comes from the aggregate's own snapshot, so the command
 * mutates the very instance the wishlist counts. A hold the snapshot leaves
 * out — expired, released or purchased (D8) — is loaded by id, and then must
 * be on this wishlist's item. Unknown, foreign and malformed ids all fail
 * alike: another list's hold id is a 404 like any other (IDOR).
 */
export async function findOwnedHold(ctx: TransactionContext, wishlist: Wishlist, holdId: string): Promise<Hold> {
  const hold = wishlist.findHold(holdId) ?? (await ctx.holds.findById(holdId));
  if (!hold || !wishlist.owns(hold)) throw new HoldNotFoundError(holdId);
  return hold;
}
```

Create `apps/api/src/application/use-cases/ExtendHold.ts`:

```ts
import { HoldNotFoundError } from '../../domain/errors.js';
import { HoldPermissions } from '../../domain/policies/HoldPermissions.js';
import type { AccessContext } from '../AccessContext.js';
import { holdDurationMs, type HoldPolicy } from '../HoldPolicy.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';
import { findOwnedHold, type HoldCommand, type HoldCommandInput } from './holdCommand.js';

export class ExtendHold implements HoldCommand {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
    private policy: HoldPolicy,
  ) {}

  async execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> {
    return this.unitOfWork.execute(async (ctx) => {
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new HoldNotFoundError(input.holdId);
      const hold = await findOwnedHold(ctx, wishlist, input.holdId);
      // Not permitted looks exactly like not found: a guest learns nothing
      // about holds that are not theirs.
      const actor = HoldPermissions.mayExtend(hold, access);
      if (!actor) throw new HoldNotFoundError(input.holdId);

      const { item, event, expectedSeq } = wishlist.extendHold(hold, now, holdDurationMs(this.policy));

      await ctx.eventStore.append(item.id.value, expectedSeq, [event], actor);
      await ctx.holds.save(hold);
      await ctx.wishlists.saveItemState(item);
      return toHoldView(wishlist, hold, now);
    });
  }
}
```

- [ ] **Step 5: Run, then commit**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS.

```bash
git add apps/api/src/application
git commit -m "feat(api): ExtendHold use case

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 5.5: `ReleaseHold`

**Files:**
- Create: `apps/api/src/application/use-cases/ReleaseHold.ts`, `ReleaseHold.test.ts`

**Interfaces:**
- Consumes: Task 5.4's `findOwnedHold`, `HoldCommand`, `twoListsWithOneItemEach`.
- Produces: `class ReleaseHold implements HoldCommand`, constructor `(unitOfWork: UnitOfWork, clock: Clock)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/application/use-cases/ReleaseHold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ReleaseHold } from './ReleaseHold.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, T0, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { HoldNotActiveError, HoldNotFoundError } from '../../domain/errors.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const useCase = new ReleaseHold(world.unitOfWork, world.clock);
  const release = (holdId: string, access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  return { ...world, release };
}

describe('ReleaseHold', () => {
  it('releases an active hold, closing every action on it', async () => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold();

    expect(await release(holdId)).toMatchObject({ holdId, status: 'released', actions: { extend: false, release: false, purchase: false } });
  });

  it('records HoldReleased as the guest and frees the unit for someone else', async () => {
    const { placeHold, release, eventStore, wishlists } = await setup();
    const { holdId } = await placeHold();

    await release(holdId);

    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest'], ['HoldReleased', 'guest']]);
    expect((await wishlists.findById(WISHLIST_ID, T0))?.itemStatusAt(ITEM_ID, T0)).toBe('available');
    await expect(placeHold(OTHER_GUEST)).resolves.toMatchObject({ status: 'active' });
  });

  it('refuses a hold that has expired', async () => {
    const { placeHold, clock, release } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY + 1);
    await expect(release(holdId)).rejects.toThrow(HoldNotActiveError);
  });

  it('refuses a hold released already', async () => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold();
    await release(holdId);
    await expect(release(holdId)).rejects.toThrow(HoldNotActiveError);
  });

  it.each([
    ['another guest', OTHER_GUEST],
    ['a caller with no session', NO_SESSION],
  ])('treats %s as if the hold did not exist', async (_who, access) => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold();
    await expect(release(holdId, access)).rejects.toThrow(HoldNotFoundError);
  });

  it('treats a hold from another list as not found (IDOR)', async () => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold(GUEST, true);
    await expect(release(holdId)).rejects.toThrow(HoldNotFoundError);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- ReleaseHold`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/api/src/application/use-cases/ReleaseHold.ts`:

```ts
import { HoldNotFoundError } from '../../domain/errors.js';
import { HoldPermissions } from '../../domain/policies/HoldPermissions.js';
import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';
import { findOwnedHold, type HoldCommand, type HoldCommandInput } from './holdCommand.js';

export class ReleaseHold implements HoldCommand {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> {
    return this.unitOfWork.execute(async (ctx) => {
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new HoldNotFoundError(input.holdId);
      const hold = await findOwnedHold(ctx, wishlist, input.holdId);
      // Guest row only in stack A; stack F adds the owner's, gated on
      // claim-status visibility.
      const actor = HoldPermissions.mayRelease(hold, access);
      if (!actor) throw new HoldNotFoundError(input.holdId);

      const { item, event, expectedSeq } = wishlist.releaseHold(hold, now);

      await ctx.eventStore.append(item.id.value, expectedSeq, [event], actor);
      await ctx.holds.save(hold);
      await ctx.wishlists.saveItemState(item);
      return toHoldView(wishlist, hold, now);
    });
  }
}
```

- [ ] **Step 4: Run, then commit**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS.

```bash
git add apps/api/src/application
git commit -m "feat(api): ReleaseHold use case

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 5.6: `MarkHoldPurchased`

**Files:**
- Create: `apps/api/src/application/use-cases/MarkHoldPurchased.ts`, `MarkHoldPurchased.test.ts`

**Interfaces:**
- Consumes: as Task 5.5, plus `Wishlist.purchaseHold`.
- Produces: `class MarkHoldPurchased implements HoldCommand`, constructor `(unitOfWork: UnitOfWork, clock: Clock)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/application/use-cases/MarkHoldPurchased.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import { ReleaseHold } from './ReleaseHold.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { HoldNotActiveError, HoldNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const purchaseUseCase = new MarkHoldPurchased(world.unitOfWork, world.clock);
  const releaseUseCase = new ReleaseHold(world.unitOfWork, world.clock);
  const purchase = (holdId: string, access: AccessContext = GUEST) => purchaseUseCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  const release = (holdId: string) => releaseUseCase.execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  return { ...world, purchase, release };
}

describe('MarkHoldPurchased', () => {
  it('marks an active hold purchased, closing every action on it', async () => {
    const { placeHold, purchase } = await setup();
    const { holdId } = await placeHold();

    expect(await purchase(holdId)).toMatchObject({ holdId, status: 'purchased', actions: { extend: false, release: false, purchase: false } });
  });

  it('records ItemPurchased as the guest; the item counts the unit as bought', async () => {
    const { placeHold, purchase, eventStore, wishlists, clock } = await setup();
    const { holdId } = await placeHold();

    await purchase(holdId);

    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest'], ['ItemPurchased', 'guest']]);
    const reloaded = await wishlists.findById(WISHLIST_ID, clock.now());
    expect(reloaded?.item?.purchasedCount).toBe(1);
    expect(reloaded?.itemStatusAt(ITEM_ID, clock.now())).toBe('purchased');
  });

  it('marks an expired hold purchased while the unit is still free (D15)', async () => {
    const { placeHold, clock, purchase } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY + 1);

    await expect(purchase(holdId)).resolves.toMatchObject({ status: 'purchased' });
  });

  it('refuses an expired hold once another guest holds the unit, and appends nothing', async () => {
    const { placeHold, clock, purchase, eventStore } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY + 1);
    await placeHold(OTHER_GUEST);

    await expect(purchase(holdId)).rejects.toThrow(ItemUnavailableError);
    expect(eventStore.recorded(ITEM_ID).map(({ event }) => event.type)).toEqual(['ItemHeld', 'ItemHeld']);
  });

  it('refuses a released hold, and a second purchase — both are terminal', async () => {
    const { placeHold, purchase, release } = await setup();
    const released = await placeHold();
    await release(released.holdId);
    await expect(purchase(released.holdId)).rejects.toThrow(HoldNotActiveError);

    const bought = await placeHold();
    await purchase(bought.holdId);
    await expect(purchase(bought.holdId)).rejects.toThrow(HoldNotActiveError);
  });

  it.each([
    ['another guest', OTHER_GUEST],
    ['a caller with no session', NO_SESSION],
  ])('treats %s as if the hold did not exist', async (_who, access) => {
    const { placeHold, purchase } = await setup();
    const { holdId } = await placeHold();
    await expect(purchase(holdId, access)).rejects.toThrow(HoldNotFoundError);
  });

  it('treats a hold from another list as not found (IDOR)', async () => {
    const { placeHold, purchase } = await setup();
    const { holdId } = await placeHold(GUEST, true);
    await expect(purchase(holdId)).rejects.toThrow(HoldNotFoundError);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- MarkHoldPurchased`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/api/src/application/use-cases/MarkHoldPurchased.ts`:

```ts
import { HoldNotFoundError } from '../../domain/errors.js';
import { HoldPermissions } from '../../domain/policies/HoldPermissions.js';
import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';
import { findOwnedHold, type HoldCommand, type HoldCommandInput } from './holdCommand.js';

export class MarkHoldPurchased implements HoldCommand {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> {
    return this.unitOfWork.execute(async (ctx) => {
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new HoldNotFoundError(input.holdId);
      const hold = await findOwnedHold(ctx, wishlist, input.holdId);
      // Guest row only; the owner's direct purchase is sub-project 4.
      const actor = HoldPermissions.mayPurchase(hold, access);
      if (!actor) throw new HoldNotFoundError(input.holdId);

      const { item, event, expectedSeq } = wishlist.purchaseHold(hold, now);

      await ctx.eventStore.append(item.id.value, expectedSeq, [event], actor);
      await ctx.holds.save(hold);
      await ctx.wishlists.saveItemState(item);
      return toHoldView(wishlist, hold, now);
    });
  }
}
```

- [ ] **Step 4: Run, then commit**

Run: `npm run lint --workspace=apps/api && npm run test --workspace=apps/api`
Expected: PASS.

```bash
git add apps/api/src/application
git commit -m "feat(api): MarkHoldPurchased use case, including expired holds with a free unit (D15)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 5.7: `GetListView`

**Files:**
- Create: `apps/api/src/application/use-cases/GetListView.ts`, `GetListView.test.ts`

**Interfaces:**
- Consumes: `HoldRepository.findForSession`, `Wishlist.itemStatusAt`, `toHoldView`, `HoldPolicy`.
- Produces:
  - `interface ListView { title: string; item: { id: string; title: string; status: ItemStatus }; myHolds: HoldView[]; capabilities: { holdDurationDays: number } }`
  - `class GetListView`, constructor `(unitOfWork: UnitOfWork, clock: Clock, policy: HoldPolicy)`, with `execute(input: { wishlistId: string }, access: AccessContext): Promise<ListView>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/application/use-cases/GetListView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GetListView } from './GetListView.js';
import { ReleaseHold } from './ReleaseHold.js';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import type { HoldPolicy } from '../HoldPolicy.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

async function setup(policy?: HoldPolicy) {
  const world = await twoListsWithOneItemEach(policy);
  const useCase = new GetListView(world.unitOfWork, world.clock, world.policy);
  const view = (access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID }, access);
  const release = (holdId: string) => new ReleaseHold(world.unitOfWork, world.clock).execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  const purchase = (holdId: string) => new MarkHoldPurchased(world.unitOfWork, world.clock).execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  return { ...world, view, release, purchase };
}

describe('GetListView', () => {
  it('shows the list, its available item, no holds, and the hold duration guests will get', async () => {
    const { view } = await setup({ durationDays: 5 });

    expect(await view()).toEqual({
      title: 'Baby Shower',
      item: { id: ITEM_ID, title: 'Stroller', status: 'available' },
      myHolds: [],
      capabilities: { holdDurationDays: 5 },
    });
  });

  it("shows the guest their own hold; another guest sees the item held but none of the guest's holds", async () => {
    const { placeHold, view } = await setup();
    const placed = await placeHold();

    const mine = await view(GUEST);
    const theirs = await view(OTHER_GUEST);

    expect(mine.item.status).toBe('held');
    expect(mine.myHolds).toEqual([placed]);
    expect(theirs.item.status).toBe('held');
    expect(theirs.myHolds).toEqual([]);
  });

  it('applies lazy expiry: once the hold lapses the item is available and the hold offers only purchase', async () => {
    const { placeHold, clock, view } = await setup();
    await placeHold();
    clock.advance(3 * DAY + 1);

    const shown = await view();

    expect(shown.item.status).toBe('available');
    expect(shown.myHolds).toMatchObject([{ status: 'expired', actions: { extend: false, release: false, purchase: true } }]);
  });

  it('leaves released holds out and keeps purchased ones', async () => {
    const { placeHold, clock, view, release, purchase } = await setup();
    const released = await placeHold();
    await release(released.holdId);
    clock.advance(DAY);
    const bought = await placeHold();
    await purchase(bought.holdId);

    const shown = await view();

    expect(shown.item.status).toBe('purchased');
    expect(shown.myHolds.map((h) => [h.holdId, h.status])).toEqual([[bought.holdId, 'purchased']]);
  });

  it('lists an expired hold before the newer active one', async () => {
    const { placeHold, clock, view } = await setup();
    const first = await placeHold();
    clock.advance(3 * DAY + 1);
    const second = await placeHold();

    expect((await view()).myHolds.map((h) => [h.holdId, h.status])).toEqual([[first.holdId, 'expired'], [second.holdId, 'active']]);
  });

  it('shows no holds to a caller without a session', async () => {
    const { placeHold, view } = await setup();
    await placeHold();
    expect((await view(NO_SESSION)).myHolds).toEqual([]);
  });

  it('throws WishlistNotFoundError for an unknown list', async () => {
    const world = await twoListsWithOneItemEach();
    const useCase = new GetListView(world.unitOfWork, world.clock, world.policy);
    await expect(useCase.execute({ wishlistId: '00000000-0000-7000-8000-999999999999' }, GUEST)).rejects.toThrow(WishlistNotFoundError);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- GetListView`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/api/src/application/use-cases/GetListView.ts`:

```ts
import type { ItemStatus } from '../../domain/entities/Item.js';
import { WishlistNotFoundError } from '../../domain/errors.js';
import type { AccessContext } from '../AccessContext.js';
import type { HoldPolicy } from '../HoldPolicy.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';

export interface ListView {
  title: string;
  item: { id: string; title: string; status: ItemStatus };
  /** This session's holds on the list, oldest expiry first. */
  myHolds: HoldView[];
  capabilities: { holdDurationDays: number };
}

/**
 * The guest's view of a list, read in one unit of work so the item's status
 * and the guest's holds come from the same snapshot.
 */
export class GetListView {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
    private policy: HoldPolicy,
  ) {}

  async execute(input: { wishlistId: string }, access: AccessContext): Promise<ListView> {
    return this.unitOfWork.execute(async (ctx) => {
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      const item = wishlist?.item;
      // A list without its item has nothing a guest can see yet; presentation
      // answers this with the same generic 404 as an unknown list.
      if (!wishlist || !item) throw new WishlistNotFoundError(input.wishlistId);

      const mine = access.guestSession
        ? await ctx.holds.findForSession(wishlist.id.value, access.guestSession.sessionHash)
        : [];

      return {
        title: wishlist.title,
        item: { id: item.id.value, title: item.title, status: wishlist.itemStatusAt(item.id.value, now) },
        // Released holds were the guest's own choice and need no follow-up;
        // expired ones stay, since D15 may still let them be purchased.
        myHolds: mine
          .filter((hold) => hold.statusAt(now) !== 'released')
          .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
          .map((hold) => toHoldView(wishlist, hold, now)),
        capabilities: { holdDurationDays: this.policy.durationDays },
      };
    });
  }
}
```

- [ ] **Step 4: Run, commit, and open PR 5**

Run: `npm run lint && npm test && npm run build`
Expected: PASS.

```bash
git add apps/api/src/application
git commit -m "feat(api): GetListView use case with this session's holds and the hold duration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
npm run test:e2e
git push -u origin feat/holds-a/05-use-cases
```

Open the PR against `feat/holds-a/04-persistence`.

---

## PR 6 — presentation: the hold lifecycle API (`feat/holds-a/06-api`, base `feat/holds-a/05-use-cases`)

```bash
git switch -c feat/holds-a/06-api feat/holds-a/05-use-cases
```

### Task 6.1: 409s carry a `code`; one table maps domain errors to HTTP

**Files:**
- Modify: `packages/shared-types/src/errorResponse.ts`, `errorResponse.test.ts`
- Create: `apps/api/src/presentation/domainErrorResponse.ts`, `domainErrorResponse.test.ts`
- Modify: `apps/api/src/presentation/routes.ts`, `routes.integration.test.ts`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces:
  - `errorCodeSchema = z.enum(['item_unavailable', 'hold_not_active', 'hold_already_extended'])` and `type ErrorCode`
  - `ErrorResponse.code?: ErrorCode`
  - `NOT_FOUND`
  - `domainErrorResponse(err: unknown): { status: 404 | 409; body: ErrorResponse } | null`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared-types/src/errorResponse.test.ts` inside its `describe`:

```ts
  it('accepts a 409 code', () => {
    expect(errorResponseSchema.safeParse({ message: 'This hold is no longer active.', code: 'hold_not_active' }).success).toBe(true);
  });

  it('rejects a code outside the documented set', () => {
    expect(errorResponseSchema.safeParse({ message: 'x', code: 'teapot' }).success).toBe(false);
  });
```

Create `apps/api/src/presentation/domainErrorResponse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { domainErrorResponse } from './domainErrorResponse.js';
import {
  ConcurrencyError, HoldAlreadyExtendedError, HoldNotActiveError, HoldNotFoundError,
  InvalidGuestKeyError, ItemNotFoundError, ItemUnavailableError, WishlistNotFoundError,
} from '../domain/errors.js';

describe('domainErrorResponse', () => {
  it.each([
    ['WishlistNotFoundError', new WishlistNotFoundError('x')],
    ['ItemNotFoundError', new ItemNotFoundError('x')],
    ['HoldNotFoundError', new HoldNotFoundError('x')],
  ])('answers %s with the generic 404 (ADR-0016/0054)', (_name, err) => {
    expect(domainErrorResponse(err)).toEqual({ status: 404, body: { message: 'Not found' } });
  });

  it.each([
    ['ItemUnavailableError', new ItemUnavailableError('x'), 'item_unavailable', 'This item is no longer available.'],
    ['HoldNotActiveError', new HoldNotActiveError('x'), 'hold_not_active', 'This hold is no longer active.'],
    ['HoldAlreadyExtendedError', new HoldAlreadyExtendedError('x'), 'hold_already_extended', 'This hold has already been extended.'],
  ])('answers %s with 409 and a code the client can branch on', (_name, err, code, message) => {
    expect(domainErrorResponse(err)).toEqual({ status: 409, body: { message, code } });
  });

  it('answers a ConcurrencyError that outlived its retries with a 409 and no code', () => {
    expect(domainErrorResponse(new ConcurrencyError('i', 0, 1))).toEqual({
      status: 409, body: { message: 'Someone else changed this at the same moment. Please try again.' },
    });
  });

  it('leaves everything else — key entry included, which answers for itself — to its caller', () => {
    expect(domainErrorResponse(new Error('boom'))).toBeNull();
    expect(domainErrorResponse(new InvalidGuestKeyError('w'))).toBeNull();
  });
});
```

In `apps/api/src/presentation/routes.integration.test.ts`, in `it('returns 409 for a second hold attempt on an already-held item', …)`, add after the status assertion:

```ts
    expect(second.json()).toEqual({ message: 'This item is no longer available.', code: 'item_unavailable' });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run build --workspace=packages/shared-types; npm run test --workspace=packages/shared-types; npm run test --workspace=apps/api -- domainErrorResponse routes.integration`
Expected: FAIL. The schema strips the code (`toBe(false)` fails), `domainErrorResponse.js` is missing, and the 409 body is still `{ message: 'Item already held' }`.

- [ ] **Step 3: Implement**

Replace `packages/shared-types/src/errorResponse.ts` with:

```ts
import { z } from 'zod';

/**
 * Machine-readable reasons for a 409 (holds-lifecycle §3), so the client can
 * branch without parsing the human message. Stack C adds hold_cap_reached,
 * stack E idempotency_conflict.
 */
export const errorCodeSchema = z.enum(['item_unavailable', 'hold_not_active', 'hold_already_extended']);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  message: z.string(),
  code: errorCodeSchema.optional(),
  issues: z.array(z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
```

Create `apps/api/src/presentation/domainErrorResponse.ts`:

```ts
import type { ErrorResponse } from '@gubbins/shared-types';
import {
  ConcurrencyError, HoldAlreadyExtendedError, HoldNotActiveError, HoldNotFoundError,
  ItemNotFoundError, ItemUnavailableError, WishlistNotFoundError,
} from '../domain/errors.js';

export const NOT_FOUND = { message: 'Not found' } as const;

/**
 * The one table from domain failure to HTTP answer — only presentation maps
 * to status codes (backend architecture). Every way of failing to reach a
 * list, item or hold is the same generic 404 (ADR-0016/0054). The 409
 * messages reach the guest as they are, so they are written for a person;
 * `code` is for the client to branch on.
 */
export function domainErrorResponse(err: unknown): { status: 404 | 409; body: ErrorResponse } | null {
  if (err instanceof WishlistNotFoundError || err instanceof ItemNotFoundError || err instanceof HoldNotFoundError) {
    return { status: 404, body: NOT_FOUND };
  }
  if (err instanceof ItemUnavailableError) {
    return { status: 409, body: { message: 'This item is no longer available.', code: 'item_unavailable' } };
  }
  if (err instanceof HoldNotActiveError) {
    return { status: 409, body: { message: 'This hold is no longer active.', code: 'hold_not_active' } };
  }
  if (err instanceof HoldAlreadyExtendedError) {
    return { status: 409, body: { message: 'This hold has already been extended.', code: 'hold_already_extended' } };
  }
  // Still conflicting after RetryingUnitOfWork's three retries.
  if (err instanceof ConcurrencyError) {
    return { status: 409, body: { message: 'Someone else changed this at the same moment. Please try again.' } };
  }
  return null;
}
```

In `apps/api/src/presentation/routes.ts`:
- Delete `const NOT_FOUND = { message: 'Not found' } as const;` and add `import { NOT_FOUND, domainErrorResponse } from './domainErrorResponse.js';`.
- Remove `ItemNotFoundError, ItemUnavailableError, ConcurrencyError` from the `../domain/errors.js` import.
- Replace the hold handler's `catch` block with:

```ts
    } catch (err) {
      const mapped = domainErrorResponse(err);
      if (mapped) return reply.code(mapped.status).send(mapped.body);
      throw err;
    }
```

- Change the hold route's 409 description to `'No unit of the item is free (item_unavailable), or a concurrent change won (no code).'`.

- [ ] **Step 4: Regenerate, run, commit**

```bash
npm run gen:api
npm run lint && npm test && npm run build
```

Expected: PASS. `openapi.json`'s `ErrorResponse` gains the `code` enum.

```bash
git add packages/shared-types apps/api apps/web/src/api/schema.gen.ts
git commit -m "feat(api): 409 responses carry a code; one table maps domain errors to HTTP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 6.2: `HOLD_DURATION_DAYS` (Review Focus 4)

**Files:**
- Create: `apps/api/src/presentation/holdPolicyConfig.ts`, `holdPolicyConfig.test.ts`
- Modify: `apps/api/src/presentation/server.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `parseHoldPolicy(env: Record<string, string | undefined>): HoldPolicy`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/presentation/holdPolicyConfig.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseHoldPolicy } from './holdPolicyConfig.js';

describe('parseHoldPolicy — HOLD_DURATION_DAYS (ops)', () => {
  it.each([
    ['unset', undefined, 3],
    ['empty, as compose passes an unset variable through', '', 3],
    ['1', '1', 1],
    ['14', '14', 14],
  ])('reads %s as %i days', (_name, raw, days) => {
    expect(parseHoldPolicy({ HOLD_DURATION_DAYS: raw })).toEqual({ durationDays: days });
  });

  it.each(['0', '-1', '1.5', '3d', 'abc', ' 2', '2 ', '1e3', '03'])('refuses %j, naming the variable', (raw) => {
    expect(() => parseHoldPolicy({ HOLD_DURATION_DAYS: raw })).toThrow(/HOLD_DURATION_DAYS must be a whole number of days, 1 or more/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- holdPolicyConfig`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement and wire**

Create `apps/api/src/presentation/holdPolicyConfig.ts`:

```ts
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../application/HoldPolicy.js';

const WHOLE_DAYS = /^[1-9][0-9]*$/;

/**
 * HOLD_DURATION_DAYS (ops, default 3) validated into a HoldPolicy at the
 * composition root (holds-lifecycle §3). A malformed value stops startup
 * with a message naming the variable, rather than minting holds that expire
 * at NaN. Unset or empty means the default: compose files commonly pass an
 * unset variable through as ''.
 */
export function parseHoldPolicy(env: Record<string, string | undefined>): HoldPolicy {
  const raw = env.HOLD_DURATION_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_HOLD_POLICY;
  if (!WHOLE_DAYS.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`HOLD_DURATION_DAYS must be a whole number of days, 1 or more (got ${JSON.stringify(raw)})`);
  }
  return { durationDays: Number(raw) };
}
```

In `apps/api/src/presentation/server.ts`:
- Add `import { parseHoldPolicy } from './holdPolicyConfig.js';`.
- Inside `main()`, directly after `logger = new ConsoleLogger();`, add:

```ts
  // Before the database opens: a bad value should stop startup with nothing to clean up.
  const holdPolicy = parseHoldPolicy(process.env);
```

- Change `buildDependencies(db, logger)` to `buildDependencies(db, logger, { holdPolicy })`.

In `.env.example`, append:

```
# Hold length in whole days (ops, ADR-0002). The one self-service extension
# adds the same again, so a hold lasts at most twice this. Empty means 3.
HOLD_DURATION_DAYS=
```

- [ ] **Step 4: Run, check the failure mode by hand, commit**

```bash
npm run test --workspace=apps/api -- holdPolicyConfig
HOLD_DURATION_DAYS=3d DATABASE_PATH=:memory: PORT=3999 npm run start --workspace=apps/api; echo "exit $?"
```

Expected: the test passes. The server prints a startup failure containing `HOLD_DURATION_DAYS must be a whole number of days, 1 or more (got "3d")` and `exit 1`.

```bash
git add apps/api/src/presentation .env.example
git commit -m "feat(api): HOLD_DURATION_DAYS configures the hold length, validated at startup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 6.3: Routes for extend, release and purchase; the list view gains "my holds" and capabilities

**Files:**
- Create: `packages/shared-types/src/holdView.ts`, `holdView.test.ts`
- Modify: `packages/shared-types/src/listView.ts`, `holdItem.ts`, `index.ts`
- Rewrite: `apps/api/src/presentation/routes.ts`, `compositionRoot.ts`
- Modify: `apps/api/src/presentation/openApiDocument.ts`, `openApiDocument.test.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify (type fixes only): `apps/web/src/features/holds/ItemView.test.tsx`, `apps/web/src/features/holds/useHoldItem.test.tsx`
- Regenerate: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Consumes: every PR 5 use case; Task 6.1's mapping.
- Produces:
  - `holdStatusSchema`, `holdViewSchema`, `type HoldView` (shared types)
  - `listViewResponseSchema` gains `myHolds: HoldView[]` and `capabilities: { holdDurationDays: number }`
  - `holdItemResponseSchema = holdViewSchema`
  - routes `POST /api/lists/:slug/holds/:holdId/extend | release | purchase` (operationIds `extendHold`, `releaseHold`, `markHoldPurchased`), each 200 `HoldView` | 404 | 409
  - `AppDependencies` gains `getListView`, `extendHold`, `releaseHold`, `markHoldPurchased`

- [ ] **Step 1: Write the failing shared-type tests**

Create `packages/shared-types/src/holdView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { holdViewSchema } from './holdView.js';
import { listViewResponseSchema } from './listView.js';

const view = {
  holdId: 'h', itemId: 'i', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z', extendedAt: null,
  actions: { extend: true, release: true, purchase: true },
};

describe('holdViewSchema', () => {
  it.each(['active', 'expired', 'released', 'purchased'])('accepts a %s hold', (status) => {
    expect(holdViewSchema.safeParse({ ...view, status }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(holdViewSchema.safeParse({ ...view, status: 'reserved' }).success).toBe(false);
  });

  it('requires every action flag', () => {
    expect(holdViewSchema.safeParse({ ...view, actions: { extend: true, release: true } }).success).toBe(false);
  });
});

describe('listViewResponseSchema', () => {
  const list = { title: 't', item: { id: 'i', title: 'x', status: 'held' }, myHolds: [view], capabilities: { holdDurationDays: 3 } };

  it('accepts a list with its holds and capabilities', () => {
    expect(listViewResponseSchema.safeParse(list).success).toBe(true);
  });

  it('requires myHolds and capabilities', () => {
    expect(listViewResponseSchema.safeParse({ title: 't', item: list.item }).success).toBe(false);
  });

  it('rejects a hold duration that is not a positive whole number', () => {
    expect(listViewResponseSchema.safeParse({ ...list, capabilities: { holdDurationDays: 0 } }).success).toBe(false);
    expect(listViewResponseSchema.safeParse({ ...list, capabilities: { holdDurationDays: 1.5 } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing route tests**

In `apps/api/src/presentation/routes.integration.test.ts`:

Add imports:

```ts
import { FixedClock } from '../application/test-fakes/FixedClock.js';
import type { BuildDependenciesOptions } from './compositionRoot.js';
```

Change the existing GET test's expected body to:

```ts
    expect(response.json()).toEqual({
      title: 'Baby Shower',
      item: { id: list.itemId, title: 'Stroller', status: 'available' },
      myHolds: [],
      capabilities: { holdDurationDays: 3 },
    });
```

Add helpers after `createList()`:

```ts
const DAY = 24 * 60 * 60 * 1000;

async function guestOn(list: { slug: string; key: string }, on: FastifyInstance = app): Promise<string> {
  return extractCookieHeader(await on.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } }));
}

function holdAction(slug: string, holdId: string, action: 'extend' | 'release' | 'purchase', cookie?: string, on: FastifyInstance = app) {
  return on.inject({ method: 'POST', url: `/api/lists/${slug}/holds/${holdId}/${action}`, headers: cookie ? { cookie } : {} });
}

async function heldByGuest(on: FastifyInstance = app) {
  const list = (await on.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } }))
    .json() as { slug: string; key: string; itemId: string };
  const cookie = await guestOn(list, on);
  const response = await on.inject({
    method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
  });
  return { list, cookie, response, holdId: (response.json() as { holdId: string }).holdId };
}

/** An app on its own database whose clock the test steps, for expiry. */
async function appAt(start: Date, options: Omit<BuildDependenciesOptions, 'clock'> = {}) {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  const clock = new FixedClock(start);
  const timed = buildApp(buildDependencies(db, undefined, { ...options, clock }), { cookieSecret: 'test-secret' });
  disposeWithApp(timed, db);
  onTestFinished(() => timed.close());
  return { timed, clock };
}
```

Append these blocks:

```ts
describe('hold lifecycle over HTTP', () => {
  it('answers a hold with the full hold view', async () => {
    const { response } = await heldByGuest();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'active', extendedAt: null, actions: { extend: true, release: true, purchase: true } });
  });

  it('extends once, then answers 409 hold_already_extended', async () => {
    const { list, cookie, holdId } = await heldByGuest();

    const first = await holdAction(list.slug, holdId, 'extend', cookie);
    const second = await holdAction(list.slug, holdId, 'extend', cookie);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ holdId, status: 'active', actions: { extend: false, release: true, purchase: true } });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ message: 'This hold has already been extended.', code: 'hold_already_extended' });
  });

  it('marks purchased; the list then shows the item purchased and the hold closed', async () => {
    const { list, cookie, holdId } = await heldByGuest();

    const purchased = await holdAction(list.slug, holdId, 'purchase', cookie);
    const view = (await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();
    const release = await holdAction(list.slug, holdId, 'release', cookie);

    expect(purchased.statusCode).toBe(200);
    expect(purchased.json()).toMatchObject({ status: 'purchased' });
    expect(view.item.status).toBe('purchased');
    expect(view.myHolds).toMatchObject([{ holdId, status: 'purchased', actions: { extend: false, release: false, purchase: false } }]);
    expect(release.statusCode).toBe(409);
    expect(release.json()).toMatchObject({ code: 'hold_not_active' });
  });

  it('releases; the hold leaves "my holds" and another guest can hold the item', async () => {
    const { list, cookie, holdId } = await heldByGuest();

    const released = await holdAction(list.slug, holdId, 'release', cookie);
    const view = (await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();
    const other = await guestOn(list);
    const retry = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie: other }, payload: { idempotencyKey: 'idem-2' },
    });

    expect(released.json()).toMatchObject({ status: 'released' });
    expect(view).toMatchObject({ item: { status: 'available' }, myHolds: [] });
    expect(retry.statusCode).toBe(201);
  });

  it.each(['extend', 'release', 'purchase'] as const)(
    '%s answers the generic 404 for anything but this session\'s hold on this list (Review Focus 5, IDOR)',
    async (action) => {
      const { list, cookie, holdId } = await heldByGuest();
      const otherGuest = await guestOn(list);
      const listB = await createList();
      const guestOnB = await guestOn(listB);

      const responses = await Promise.all([
        holdAction(list.slug, holdId, action, otherGuest),
        holdAction(listB.slug, holdId, action, guestOnB),
        holdAction(list.slug, 'not-a-uuid', action, cookie),
        holdAction(list.slug, '00000000-0000-7000-8000-999999999999', action, cookie),
        holdAction(list.slug, holdId, action),
        holdAction('no-such-list', holdId, action, cookie),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: 'Not found' });
      }
    },
  );
});

describe('lazy expiry and the configured duration over HTTP', () => {
  const T0 = new Date('2026-01-01T00:00:00.000Z');

  it('frees the item the moment a hold lapses, and still lets its guest mark it purchased (D15)', async () => {
    const { timed, clock } = await appAt(T0);
    const { list, cookie, holdId } = await heldByGuest(timed);

    clock.advance(3 * DAY + 1);
    const view = (await timed.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();
    const extend = await holdAction(list.slug, holdId, 'extend', cookie, timed);
    const purchase = await holdAction(list.slug, holdId, 'purchase', cookie, timed);

    expect(view.item.status).toBe('available');
    expect(view.myHolds).toMatchObject([{ holdId, status: 'expired', actions: { extend: false, release: false, purchase: true } }]);
    expect(extend.statusCode).toBe(409);
    expect(extend.json()).toMatchObject({ code: 'hold_not_active' });
    expect(purchase.json()).toMatchObject({ status: 'purchased' });
  });

  it('advertises the configured HOLD_DURATION_DAYS and holds for exactly that long', async () => {
    const { timed } = await appAt(T0, { holdPolicy: { durationDays: 1 } });
    const { list, cookie, response } = await heldByGuest(timed);

    const view = (await timed.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();

    expect(view.capabilities).toEqual({ holdDurationDays: 1 });
    expect(response.json()).toMatchObject({ expiresAt: new Date(T0.getTime() + DAY).toISOString() });
  });
});
```

In `apps/api/src/presentation/openApiDocument.test.ts`, change the expected statuses to:

```ts
    expect(statuses).toEqual({
      createList: ['201', '400'],
      enterGuestKey: ['200', '400', '404'],
      getListView: ['200', '404'],
      holdItem: ['201', '400', '404', '409'],
      extendHold: ['200', '404', '409'],
      releaseHold: ['200', '404', '409'],
      markHoldPurchased: ['200', '404', '409'],
    });
```

and the counts: `toHaveLength(11)` becomes `toHaveLength(20)`; both `toHaveLength(7)` and `Array(7)` become `13`.

- [ ] **Step 3: Run them to see them fail**

Run: `npm run build --workspace=packages/shared-types; npm run test --workspace=packages/shared-types; npm run test --workspace=apps/api -- routes.integration openApiDocument`
Expected: FAIL. `./holdView.js` is missing, the action routes answer 404 (unregistered), and the GET body lacks `myHolds`.

- [ ] **Step 4: Add the shared types**

Create `packages/shared-types/src/holdView.ts`:

```ts
import { z } from 'zod';

export const holdStatusSchema = z.enum(['active', 'expired', 'released', 'purchased']);
export type HoldStatus = z.infer<typeof holdStatusSchema>;

/**
 * A hold as its own guest sees it. `actions` are decided by the server's
 * domain — the client shows exactly those and never re-derives a rule.
 */
export const holdViewSchema = z.object({
  holdId: z.string(),
  itemId: z.string(),
  status: holdStatusSchema,
  expiresAt: z.string(),
  extendedAt: z.string().nullable(),
  actions: z.object({ extend: z.boolean(), release: z.boolean(), purchase: z.boolean() }),
});
export type HoldView = z.infer<typeof holdViewSchema>;
```

Replace `packages/shared-types/src/listView.ts` with:

```ts
import { z } from 'zod';
import { holdViewSchema } from './holdView.js';

export const itemStatusSchema = z.enum(['available', 'held', 'purchased']);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const listViewResponseSchema = z.object({
  title: z.string(),
  item: z.object({
    id: z.string(),
    title: z.string(),
    status: itemStatusSchema,
  }),
  /** This session's holds on the list, oldest expiry first. Released holds are left out. */
  myHolds: z.array(holdViewSchema),
  /** What this server does for guests (ops: capability flags). Stack G adds `reminders`. */
  capabilities: z.object({ holdDurationDays: z.number().int().positive() }),
});
export type ListViewResponse = z.infer<typeof listViewResponseSchema>;
```

Replace `packages/shared-types/src/holdItem.ts` with:

```ts
import { z } from 'zod';
import { holdViewSchema, type HoldView } from './holdView.js';

export const holdItemRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1),
});
export type HoldItemRequest = z.infer<typeof holdItemRequestSchema>;

/** The hold just placed — or, for a replayed idempotency key, the original hold as it is now (ADR-0048). */
export const holdItemResponseSchema = holdViewSchema;
export type HoldItemResponse = HoldView;
```

In `packages/shared-types/src/index.ts`, add `export * from './holdView.js';` after the `holdItem` line.

- [ ] **Step 5: Wire the use cases and register the routes**

Replace `apps/api/src/presentation/compositionRoot.ts` with:

```ts
import type { Kysely } from 'kysely';
import type { Database } from '../infrastructure/db/schema.js';
import { UnitOfWorkKysely } from '../infrastructure/UnitOfWorkKysely.js';
import { WishlistRepositoryKysely } from '../infrastructure/WishlistRepositoryKysely.js';
import { ClockSystem } from '../infrastructure/ClockSystem.js';
import { TokenGeneratorCrypto } from '../infrastructure/TokenGeneratorCrypto.js';
import { SecretComparerCrypto } from '../infrastructure/SecretComparerCrypto.js';
import { HasherSha256 } from '../infrastructure/HasherSha256.js';
import { ConsoleLogger } from '../infrastructure/ConsoleLogger.js';
import { LoggingEventStore } from '../infrastructure/LoggingEventStore.js';
import { RetryingUnitOfWork } from '../application/RetryingUnitOfWork.js';
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../application/HoldPolicy.js';
import { CreateList } from '../application/use-cases/CreateList.js';
import { EnterGuestKey } from '../application/use-cases/EnterGuestKey.js';
import { GetListView } from '../application/use-cases/GetListView.js';
import { HoldItem } from '../application/use-cases/HoldItem.js';
import { ExtendHold } from '../application/use-cases/ExtendHold.js';
import { ReleaseHold } from '../application/use-cases/ReleaseHold.js';
import { MarkHoldPurchased } from '../application/use-cases/MarkHoldPurchased.js';
import type { Clock } from '../application/ports/Clock.js';
import type { Hasher } from '../application/ports/Hasher.js';
import type { Logger } from '../application/ports/Logger.js';

export interface AppDependencies {
  createList: CreateList;
  enterGuestKey: EnterGuestKey;
  getListView: GetListView;
  holdItem: HoldItem;
  extendHold: ExtendHold;
  releaseHold: ReleaseHold;
  markHoldPurchased: MarkHoldPurchased;
  /** For resolving a URL's slug before access is checked; use cases load their own aggregate. */
  wishlists: WishlistRepositoryKysely;
  clock: Clock;
  hasher: Hasher;
  logger: Logger;
}

export interface BuildDependenciesOptions {
  /** Defaults to the system clock; integration tests pass a FixedClock to step through expiry. */
  clock?: Clock;
  /** Validated from HOLD_DURATION_DAYS by the server (holdPolicyConfig.ts); defaults to 3 days. */
  holdPolicy?: HoldPolicy;
}

export function buildDependencies(
  db: Kysely<Database>,
  logger: Logger = new ConsoleLogger(),
  options: BuildDependenciesOptions = {},
): AppDependencies {
  const unitOfWork = new RetryingUnitOfWork(new UnitOfWorkKysely(db, (base) => new LoggingEventStore(base, logger)));
  const tokenGenerator = new TokenGeneratorCrypto();
  const clock = options.clock ?? new ClockSystem();
  const holdPolicy = options.holdPolicy ?? DEFAULT_HOLD_POLICY;
  const hasher = new HasherSha256();
  const secretComparer = new SecretComparerCrypto();
  const wishlists = new WishlistRepositoryKysely(db);

  return {
    createList: new CreateList(unitOfWork, tokenGenerator),
    enterGuestKey: new EnterGuestKey(wishlists, secretComparer, tokenGenerator, clock),
    getListView: new GetListView(unitOfWork, clock, holdPolicy),
    holdItem: new HoldItem(unitOfWork, tokenGenerator, clock, hasher, holdPolicy),
    extendHold: new ExtendHold(unitOfWork, clock, holdPolicy),
    releaseHold: new ReleaseHold(unitOfWork, clock),
    markHoldPurchased: new MarkHoldPurchased(unitOfWork, clock),
    wishlists,
    clock,
    hasher,
    logger,
  };
}
```

In `openApiDocument.ts`, add to `noDependencies`:

```ts
  getListView: unusedDependency('getListView'),
  extendHold: unusedDependency('extendHold'),
  releaseHold: unusedDependency('releaseHold'),
  markHoldPurchased: unusedDependency('markHoldPurchased'),
```

Replace `apps/api/src/presentation/routes.ts` with:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createListRequestSchema, createListResponseSchema,
  enterGuestKeyRequestSchema, enterGuestKeyResponseSchema,
  holdItemRequestSchema, holdItemResponseSchema, holdViewSchema, listViewResponseSchema,
  errorResponseSchema,
} from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import type { AccessContext } from '../application/AccessContext.js';
import type { HoldCommand } from '../application/use-cases/holdCommand.js';
import type { Wishlist } from '../domain/entities/Wishlist.js';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../domain/errors.js';
import { SESSION_COOKIE, buildAccessContext, type SessionPayload } from './accessContext.js';
import { NOT_FOUND, domainErrorResponse } from './domainErrorResponse.js';

// Path parameters are an HTTP concern, so their schemas live here rather than
// in @gubbins/shared-types (which holds request/response bodies only).
const slugParams = z.object({ slug: z.string() });
const slugItemParams = z.object({ slug: z.string(), itemId: z.string() });
const slugHoldParams = z.object({ slug: z.string(), holdId: z.string() });

// One shared component in the OpenAPI document instead of the error body
// inlined into every 4xx response.
z.globalRegistry.add(errorResponseSchema, { id: 'ErrorResponse' });

/** A JSON response with the description OpenAPI shows for its status. */
function json<T extends z.ZodType>(description: string, schema: T) {
  return { description, content: { 'application/json': { schema } } };
}

const INVALID_REQUEST = 'The request did not match the schema.';
const HOLD_NOT_FOUND = "No such list or hold, no valid session for the list, or the hold is not this session's. These are deliberately indistinguishable (ADR-016, ADR-054).";

export function registerRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * The URL's list and the guest session presented for it, or null — which
   * every guest route answers with the same generic 404 as an unknown slug:
   * a caller must not tell "no such list" from "list exists, you're not in
   * it", or slugs could be enumerated (ADR-016/054).
   */
  async function guestAccess(request: FastifyRequest, slug: string): Promise<{ wishlist: Wishlist; access: AccessContext } | null> {
    const wishlist = await deps.wishlists.findBySlug(slug, deps.clock.now());
    if (!wishlist) return null;
    const access = buildAccessContext(request, wishlist, deps.hasher);
    return access.guestSession ? { wishlist, access } : null;
  }

  /** Answers a domain error with its mapped status, or rethrows it for the generic 500 handler. */
  function sendDomainError(reply: FastifyReply, err: unknown) {
    const mapped = domainErrorResponse(err);
    if (!mapped) throw err;
    return reply.code(mapped.status).send(mapped.body);
  }

  app.post('/api/lists', {
    schema: {
      operationId: 'createList',
      body: createListRequestSchema,
      response: {
        201: json('The list was created.', createListResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const result = await deps.createList.execute(request.body);
    return reply.code(201).send(result);
  });

  app.post('/api/lists/:slug/session', {
    schema: {
      operationId: 'enterGuestKey',
      params: slugParams,
      body: enterGuestKeyRequestSchema,
      response: {
        200: json('The key was accepted and a session cookie was set.', enterGuestKeyResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list, or the key is wrong. The two are deliberately indistinguishable (ADR-016, ADR-054).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    try {
      const result = await deps.enterGuestKey.execute({ slug, key: request.body.key });
      const payload: SessionPayload = { wishlistId: result.wishlistId, keyGen: result.keyGen, sessionId: result.sessionId };
      reply.setCookie(SESSION_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict' });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      // Same generic response for "no such list" and "wrong key" —
      // access-identity.md / ADR-016 / ADR-054 forbid distinguishing them.
      if (err instanceof WishlistNotFoundError || err instanceof InvalidGuestKeyError) {
        return reply.code(404).send(NOT_FOUND);
      }
      throw err;
    }
  });

  app.get('/api/lists/:slug', {
    schema: {
      operationId: 'getListView',
      params: slugParams,
      response: {
        200: json("The list, its item, this session's holds, and what this server does for guests.", listViewResponseSchema),
        404: json('No such list, or no valid session for it. The two are deliberately indistinguishable (ADR-016, ADR-054).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const guest = await guestAccess(request, request.params.slug);
    if (!guest) return reply.code(404).send(NOT_FOUND);
    try {
      const view = await deps.getListView.execute({ wishlistId: guest.wishlist.id.value }, guest.access);
      return reply.code(200).send(view);
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  app.post('/api/lists/:slug/items/:itemId/hold', {
    schema: {
      operationId: 'holdItem',
      params: slugItemParams,
      body: holdItemRequestSchema,
      response: {
        201: json('The item is now held for this session; a replayed idempotency key returns the same hold.', holdItemResponseSchema),
        400: json(INVALID_REQUEST, errorResponseSchema),
        404: json('No such list or item, or no valid session for the list. These are deliberately indistinguishable (ADR-016, ADR-054).', errorResponseSchema),
        409: json('No unit of the item is free (item_unavailable), or a concurrent change won (no code).', errorResponseSchema),
      },
    },
  }, async (request, reply) => {
    const { slug, itemId } = request.params;
    const guest = await guestAccess(request, slug);
    if (!guest) return reply.code(404).send(NOT_FOUND);
    try {
      // The use case loads the wishlist this slug resolved to and asks it for
      // the item, so another list's item id is ItemNotFoundError — a 404.
      const view = await deps.holdItem.execute({ wishlistId: guest.wishlist.id.value, itemId, idempotencyKey: request.body.idempotencyKey }, guest.access);
      return reply.code(201).send(view);
    } catch (err) {
      return sendDomainError(reply, err);
    }
  });

  const holdCommands: { action: 'extend' | 'release' | 'purchase'; operationId: string; command: HoldCommand; done: string; conflict: string }[] = [
    {
      action: 'extend', operationId: 'extendHold', command: deps.extendHold,
      done: 'The hold was extended once, by the configured duration, from its current expiry.',
      conflict: 'The hold is not active (hold_not_active) or was already extended (hold_already_extended).',
    },
    {
      action: 'release', operationId: 'releaseHold', command: deps.releaseHold,
      done: 'The hold was released; its unit is free for others.',
      conflict: 'The hold is not active (hold_not_active).',
    },
    {
      action: 'purchase', operationId: 'markHoldPurchased', command: deps.markHoldPurchased,
      done: 'The hold was marked purchased.',
      conflict: 'The hold was already released or purchased (hold_not_active), or it expired and no unit is free any more (item_unavailable).',
    },
  ];

  // No request body: in stack A the session cookie is the only credential.
  // Stack E adds `{ timestamp, signature }` for the hold link.
  for (const { action, operationId, command, done, conflict } of holdCommands) {
    app.post(`/api/lists/:slug/holds/:holdId/${action}`, {
      schema: {
        operationId,
        params: slugHoldParams,
        response: {
          200: json(done, holdViewSchema),
          404: json(HOLD_NOT_FOUND, errorResponseSchema),
          409: json(conflict, errorResponseSchema),
        },
      },
    }, async (request, reply) => {
      const guest = await guestAccess(request, request.params.slug);
      if (!guest) return reply.code(404).send(NOT_FOUND);
      try {
        const view = await command.execute({ wishlistId: guest.wishlist.id.value, holdId: request.params.holdId }, guest.access);
        return reply.code(200).send(view);
      } catch (err) {
        return sendDomainError(reply, err);
      }
    });
  }
}
```

- [ ] **Step 6: Regenerate and keep the web app compiling**

```bash
npm run gen:api
```

The web app's test mocks are typed by the contract, so two of them must now send the new shapes. No component changes yet; that is PR 8.

In `apps/web/src/features/holds/ItemView.test.tsx`, replace the 201 mock body `{ holdId: 'hold-1', itemId: 'item-1', expiresAt: '2026-01-04T00:00:00.000Z' }` with:

```ts
{ holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z', extendedAt: null, actions: { extend: true, release: true, purchase: true } }
```

In `apps/web/src/features/holds/useHoldItem.test.tsx`, change the `listView` factory to:

```ts
const listView = (status: ListViewResponse['item']['status']): ListViewResponse => ({
  title: 'Baby Shower',
  item: { id: 'item-1', title: 'Stroller', status },
  myHolds: [],
  capabilities: { holdDurationDays: 3 },
});
```

and its raw 201 body to the same hold view as above.

- [ ] **Step 7: Run everything, then commit**

Run: `npm run lint && npm test && npm run build`
Expected: PASS. Web tests stay green unchanged, apart from the two mock bodies.

```bash
git add packages/shared-types apps/api apps/web/src
git commit -m "feat(api): extend, release and mark-purchased routes; list view shows this session's holds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 6.4: ADR-0075's event-type/actor matrix

**Files:**
- Create: `apps/api/src/presentation/ledgerActors.integration.test.ts`

**Interfaces:**
- Consumes: the full HTTP surface; `LedgerEvent`, `Actor`.

- [ ] **Step 1: Write the test**

Create `apps/api/src/presentation/ledgerActors.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import type { Database } from '../infrastructure/db/schema.js';
import type { Actor } from '../domain/Actor.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import type { Logger } from '../application/ports/Logger.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';

/**
 * ADR-0075: "A test should assert each type is appended only with its
 * currently permitted roles, so that a new shared path is a deliberate
 * change rather than an accident." Keyed by LedgerEvent['type'], so a new
 * event type does not compile until this table says who may raise it.
 * Stack F adds 'owner' to HoldReleased; sub-project 4 adds it to
 * ItemPurchased.
 */
const PERMITTED_ACTORS: Record<LedgerEvent['type'], readonly Actor[]> = {
  ItemHeld: ['guest'],
  HoldExtended: ['guest'],
  HoldReleased: ['guest'],
  ItemPurchased: ['guest'],
};

const silent: Logger = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };
let db: Kysely<Database>;
let app: FastifyInstance;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  app = buildApp(buildDependencies(db, silent), { cookieSecret: 'test-secret' });
  disposeWithApp(app, db);
});

afterEach(async () => {
  await app.close();
});

function cookieOf(response: LightMyRequestResponse): string {
  const setCookie = response.headers['set-cookie'];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
}

async function holdOnNewList() {
  const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'L', itemTitle: 'I' } })).json() as { slug: string; key: string; itemId: string };
  const cookie = cookieOf(await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } }));
  const { holdId } = (await app.inject({
    method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'k' },
  })).json() as { holdId: string };
  const act = (action: string) => app.inject({ method: 'POST', url: `/api/lists/${list.slug}/holds/${holdId}/${action}`, headers: { cookie } });
  return { act };
}

/** Every event type, through the real write path. */
async function raiseEveryEventType(): Promise<void> {
  const bought = await holdOnNewList();
  expect((await bought.act('extend')).statusCode).toBe(200);
  expect((await bought.act('purchase')).statusCode).toBe(200);
  const dropped = await holdOnNewList();
  expect((await dropped.act('release')).statusCode).toBe(200);
}

describe('ledger events and their actors (ADR-0075)', () => {
  it('appends every event type, each only with a role permitted to raise it', async () => {
    await raiseEveryEventType();

    const rows = await db.selectFrom('event_log').select(['event_type', 'actor']).execute();

    expect(new Set(rows.map((r) => r.event_type))).toEqual(new Set(Object.keys(PERMITTED_ACTORS)));
    for (const { event_type, actor } of rows) {
      expect(PERMITTED_ACTORS[event_type as LedgerEvent['type']], `${event_type} appended as ${actor}`).toContain(actor);
    }
  });

  it('versions every payload, stamps when it happened, and keeps the actor out of it', async () => {
    await raiseEveryEventType();

    const rows = await db.selectFrom('event_log').select('payload').execute();

    for (const { payload } of rows) {
      const event = JSON.parse(payload) as Record<string, unknown>;
      expect(event).toMatchObject({ v: 1, occurredAt: expect.any(String) });
      expect(event).not.toHaveProperty('actor');
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test --workspace=apps/api -- ledgerActors`
Expected: PASS. This pins today's matrix. To see it bite, temporarily change `ExtendHold`'s `append(…, actor)` to `append(…, 'owner')`; the first test should FAIL with `HoldExtended appended as owner`. Revert.

- [ ] **Step 3: Commit and open PR 6**

```bash
git add apps/api/src/presentation/ledgerActors.integration.test.ts
git commit -m "test(api): each ledger event type is appended only by its permitted roles (ADR-0075)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
npm run test:e2e
git push -u origin feat/holds-a/06-api
```

Open the PR against `feat/holds-a/05-use-cases`. The existing walking-skeleton e2e still passes: the web app has not changed, and `GET` only gained fields.

---

## PR 7 — minimal `rebuildProjections` (D18) (`feat/holds-a/07-rebuild`, base `feat/holds-a/06-api`)

```bash
git switch -c feat/holds-a/07-rebuild feat/holds-a/06-api
```

### Task 7.1: Re-fold `holds` and `item_state` from `event_log`

D10 and D13 are justified by rebuild-safety, and the testing spec requires a rebuild test. This makes the claim "every projection is derivable from the ledger" tested rather than assumed. The re-fold is checked against state produced by the real use cases, which is why it lands after them.

**Files:**
- Create: `apps/api/src/infrastructure/projections/rebuildProjections.ts`
- Create: `apps/api/src/infrastructure/projections/rebuildProjections.integration.test.ts`
- Modify: `apps/api/package.json` (script)
- Modify: `docs/spec/data-and-persistence.md` (one line: how to run it)

**Interfaces:**
- Consumes: `inImmediateTransaction`, `LedgerEvent`, `migrateToLatest`, the PR 5/6 use cases (in the test).
- Produces:
  - `rebuildProjections(db: Kysely<Database>): Promise<{ events: number }>`
  - `class RebuildError extends Error`
  - `npm run rebuild-projections --workspace=apps/api`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/infrastructure/projections/rebuildProjections.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from '../db/createDb.js';
import { migrateToLatest } from '../db/migrate.js';
import type { Database } from '../db/schema.js';
import { RebuildError, rebuildProjections } from './rebuildProjections.js';
import { buildDependencies, type AppDependencies } from '../../presentation/compositionRoot.js';
import { FixedClock } from '../../application/test-fakes/FixedClock.js';
import type { AccessContext } from '../../application/AccessContext.js';
import type { Logger } from '../../application/ports/Logger.js';

const DAY = 24 * 60 * 60 * 1000;
const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };
const OTHER_GUEST: AccessContext = { guestSession: { sessionHash: 'b'.repeat(64) } };
const silent: Logger = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };

let db: Kysely<Database>;
let deps: AppDependencies;
let clock: FixedClock;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
  deps = buildDependencies(db, silent, { clock });
});

afterEach(async () => {
  await db.destroy();
});

/** The event-derived projections, minus write-time bookkeeping (created_at / updated_at record when a row was written, not a ledger fact). */
async function projections() {
  return {
    holds: await db.selectFrom('holds')
      .select(['id', 'item_id', 'secret', 'session_hash', 'idempotency_key', 'expires_at', 'extended_at', 'released_at', 'purchased_at'])
      .orderBy('id').execute(),
    itemState: await db.selectFrom('item_state').select(['item_id', 'seq', 'purchased_count']).orderBy('item_id').execute(),
  };
}

async function newList() {
  const { slug, itemId } = await deps.createList.execute({ listTitle: 'L', itemTitle: 'I' });
  const wishlist = await deps.wishlists.findBySlug(slug, clock.now());
  const wishlistId = wishlist!.id.value;
  const hold = (access: AccessContext, idempotencyKey: string) => deps.holdItem.execute({ wishlistId, itemId, idempotencyKey }, access);
  const command = { wishlistId };
  return { hold, command };
}

/** Every event type and every hold state, through the real write path. */
async function aBusyLedger(): Promise<void> {
  const extendedThenBought = await newList();
  const releasedThenReheld = await newList();
  const lapsedThenBought = await newList();
  const stillActive = await newList();
  await newList(); // a list nobody touched: its item_state must fold back to zero

  const a = await extendedThenBought.hold(GUEST, 'a');
  const b = await releasedThenReheld.hold(GUEST, 'b');
  const c = await lapsedThenBought.hold(GUEST, 'c');
  await stillActive.hold(GUEST, 'd');

  clock.advance(DAY);
  await deps.extendHold.execute({ ...extendedThenBought.command, holdId: a.holdId }, GUEST);
  await deps.releaseHold.execute({ ...releasedThenReheld.command, holdId: b.holdId }, GUEST);
  await releasedThenReheld.hold(OTHER_GUEST, 'b2');

  clock.advance(DAY);
  await deps.markHoldPurchased.execute({ ...extendedThenBought.command, holdId: a.holdId }, GUEST);

  clock.advance(2 * DAY);
  await deps.markHoldPurchased.execute({ ...lapsedThenBought.command, holdId: c.holdId }, GUEST);
}

describe('rebuildProjections (D18)', () => {
  it('re-folds exactly the state the write path maintained incrementally', async () => {
    await aBusyLedger();
    const incremental = await projections();

    const { events } = await rebuildProjections(db);

    expect(await projections()).toEqual(incremental);
    expect(events).toBe((await db.selectFrom('event_log').select('id').execute()).length);
  });

  it('repairs a projection that drifted from the ledger', async () => {
    await aBusyLedger();
    const incremental = await projections();
    await db.updateTable('item_state').set({ seq: 99, purchased_count: 7 }).execute();
    await db.updateTable('holds').set({ released_at: null, extended_at: '2000-01-01T00:00:00.000Z' }).execute();

    await rebuildProjections(db);

    expect(await projections()).toEqual(incremental);
  });

  it('refuses, and changes nothing, when a hold has no row to carry its secret over from', async () => {
    await aBusyLedger();
    const [victim] = await db.selectFrom('holds').select('id').execute();
    await db.deleteFrom('holds').where('id', '=', victim.id).execute();
    const before = await projections();

    await expect(rebuildProjections(db)).rejects.toThrow(RebuildError);
    expect(await projections()).toEqual(before);
  });

  it('refuses a payload version it does not know', async () => {
    const { hold } = await newList();
    const placed = await hold(GUEST, 'k');
    const row = await db.selectFrom('event_log').select(['id', 'payload']).executeTakeFirstOrThrow();
    await db.updateTable('event_log').set({ payload: JSON.stringify({ ...JSON.parse(row.payload), v: 2 }) }).where('id', '=', row.id).execute();

    await expect(rebuildProjections(db)).rejects.toThrow(/unsupported payload version 2/);
    expect((await db.selectFrom('holds').select('id').execute()).map((h) => h.id)).toEqual([placed.holdId]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --workspace=apps/api -- rebuildProjections`
Expected: FAIL. `./rebuildProjections.js` cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/api/src/infrastructure/projections/rebuildProjections.ts`:

```ts
import { pathToFileURL } from 'node:url';
import { sql, type Kysely } from 'kysely';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';
import { createDb } from '../db/createDb.js';
import { inImmediateTransaction } from '../db/immediateTransaction.js';
import { migrateToLatest } from '../db/migrate.js';
import type { Database } from '../db/schema.js';

export class RebuildError extends Error {}

function parse(row: { id: number; event_type: string; payload: string }): LedgerEvent {
  const event = JSON.parse(row.payload) as LedgerEvent;
  if (event.v !== 1) throw new RebuildError(`event_log row ${row.id}: unsupported payload version ${String(event.v)}`);
  if (event.type !== row.event_type) {
    throw new RebuildError(`event_log row ${row.id}: payload type ${event.type} does not match event_type ${row.event_type}`);
  }
  return event;
}

/**
 * Truncates and re-folds the event-derived projections — `holds` and
 * `item_state` — from `event_log`, the source of truth (data & persistence).
 * Minimal by design (holds-lifecycle D18). Tables outside rebuild scope
 * (guest_pii, hold_reminders and the rest, as later stacks add them) are
 * never touched.
 *
 * One exception until stack E: the hold `secret` is in no event (ItemHeld
 * carries only its hash), so it is carried over from the row being
 * replaced. A hold with no row to carry from cannot be rebuilt, and the
 * whole rebuild fails rather than inventing a credential. Stack E replaces
 * the secret with ItemHeld.publicKey, which removes the exception.
 *
 * One BEGIN IMMEDIATE transaction: any failure leaves every projection as
 * it was.
 */
export async function rebuildProjections(db: Kysely<Database>): Promise<{ events: number }> {
  return inImmediateTransaction(db, async (trx) => {
    const secrets = new Map(
      (await trx.selectFrom('holds').select(['id', 'secret']).execute()).map((row) => [row.id, row.secret]),
    );
    await trx.deleteFrom('holds').execute();

    const rows = await trx.selectFrom('event_log').select(['id', 'item_id', 'event_type', 'payload']).orderBy('id').execute();
    for (const row of rows) {
      const event = parse(row);
      switch (event.type) {
        case 'ItemHeld': {
          const secret = secrets.get(event.holdId);
          if (secret === undefined) {
            throw new RebuildError(`hold ${event.holdId}: no projection row to carry its secret over from; the ledger cannot supply it until stack E`);
          }
          await trx.insertInto('holds').values({
            id: event.holdId, item_id: row.item_id, secret, session_hash: event.sessionHash,
            idempotency_key: event.idempotencyKey, expires_at: event.expiresAt,
            extended_at: null, released_at: null, purchased_at: null, created_at: event.occurredAt,
          }).execute();
          break;
        }
        case 'HoldExtended':
          await trx.updateTable('holds').set({ expires_at: event.expiresAt, extended_at: event.occurredAt }).where('id', '=', event.holdId).execute();
          break;
        case 'HoldReleased':
          await trx.updateTable('holds').set({ released_at: event.occurredAt }).where('id', '=', event.holdId).execute();
          break;
        case 'ItemPurchased':
          await trx.updateTable('holds').set({ purchased_at: event.occurredAt }).where('id', '=', event.holdId).execute();
          break;
        default: {
          // Exhaustive over LedgerEvent: a new event type fails to compile
          // here until the fold handles it. At runtime, an event_type this
          // build does not know refuses the rebuild.
          const unknown: never = event;
          throw new RebuildError(`event_log row ${row.id}: unknown event type ${String((unknown as { type?: unknown }).type)}`);
        }
      }
    }

    // seq and purchased_count are pure functions of each item's stream;
    // an item with no events folds back to zero.
    await sql`
      update item_state set
        seq = (select coalesce(max(seq), 0) from event_log where event_log.item_id = item_state.item_id),
        purchased_count = (select count(*) from event_log where event_log.item_id = item_state.item_id and event_type = 'ItemPurchased'),
        updated_at = ${new Date().toISOString()}
    `.execute(trx);

    return { events: rows.length };
  });
}

/** CLI: `npm run rebuild-projections`, against DATABASE_PATH. Same library-and-CLI guard as migrate.ts. */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const db = createDb(process.env.DATABASE_PATH ?? './data/wishlist.db');
  try {
    await migrateToLatest(db);
    const { events } = await rebuildProjections(db);
    console.log(`Rebuilt holds and item_state from ${events} events.`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
```

In `apps/api/package.json` `scripts`, add after `"migrate"`:

```json
    "rebuild-projections": "tsx src/infrastructure/projections/rebuildProjections.ts",
```

In `docs/spec/data-and-persistence.md`, at the end of the `rebuildProjections` bullet, append:

```markdown
  Run it with `npm run rebuild-projections --workspace=apps/api` against
  `DATABASE_PATH`; it folds `holds` and `item_state` in one transaction
  and leaves every other table untouched.
```

- [ ] **Step 4: Run, then exercise the CLI**

```bash
npm run test --workspace=apps/api -- rebuildProjections
S=/tmp/claude-1000/-workspace/579b5866-7072-4c64-b51f-e56c8ae4460e/scratchpad
DATABASE_PATH=$S/rebuild.db npm run rebuild-projections --workspace=apps/api
rm -f $S/rebuild.db*
```

Expected: the tests PASS, and the CLI prints `Rebuilt holds and item_state from 0 events.`

- [ ] **Step 5: Run everything, commit, open PR 7**

Run: `npm run lint && npm test && npm run build`
Expected: PASS. The integration test imports `presentation/compositionRoot` from `infrastructure/`, which the layer lint allows: only `domain/` and `application/` are restricted.

```bash
git add apps/api docs/spec/data-and-persistence.md
git commit -m "feat(api): minimal rebuildProjections re-folds holds and item_state from the ledger (D18)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
npm run test:e2e
git push -u origin feat/holds-a/07-rebuild
```

Open the PR against `feat/holds-a/06-api`.

---

## PR 8 — web: "Your holds", the dialog-open key, and e2e (`feat/holds-a/08-web-e2e`, base `feat/holds-a/07-rebuild`)

```bash
git switch -c feat/holds-a/08-web-e2e feat/holds-a/07-rebuild
```

Run web tests from `apps/web` as `npx vitest run --testTimeout=30000 <path>` in the dev container (see Global Constraints). `npm test` at the root is unchanged.

### Task 8.1: API client — the three hold actions, and the 409 `code` on `ApiError`

**Files:**
- Modify: `apps/web/src/api/client.ts`, `client.test.ts`

**Interfaces:**
- Produces:
  - `api.extendHold(slug: string, holdId: string): Promise<HoldView>`, likewise `api.releaseHold` and `api.markHoldPurchased`
  - `ApiError.code?: string`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/api/client.test.ts`, and add `import type { HoldView } from '@gubbins/shared-types';` to its imports:

```ts
describe('hold actions', () => {
  const view: HoldView = {
    holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-07T00:00:00.000Z',
    extendedAt: '2026-01-02T00:00:00.000Z', actions: { extend: false, release: true, purchase: true },
  };

  it.each([
    ['extendHold', 'extend'],
    ['releaseHold', 'release'],
    ['markHoldPurchased', 'purchase'],
  ] as const)('%s posts to the %s route with no body and returns the hold view', async (method, action) => {
    let path = '';
    let body = 'unset';
    let contentType: string | null = 'unset';
    server.use(http.post(`/api/lists/:slug/holds/:holdId/${action}`, async ({ request }) => {
      path = new URL(request.url).pathname;
      body = await request.text();
      contentType = request.headers.get('content-type');
      return HttpResponse.json(view);
    }));

    await expect(api[method]('abc123', 'hold-1')).resolves.toEqual(view);

    expect(path).toBe(`/api/lists/abc123/holds/hold-1/${action}`);
    expect(body).toBe('');
    // A JSON content type on an empty body is a 400 from Fastify
    // (FST_ERR_CTP_EMPTY_JSON_BODY), so none may be sent.
    expect(contentType).toBeNull();
  });

  it('carries the 409 code on ApiError, beside the message', async () => {
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));

    await expect(api.extendHold('abc123', 'hold-1'))
      .rejects.toMatchObject({ status: 409, code: 'hold_not_active', message: 'This hold is no longer active.' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 src/api/client.test.ts`
Expected: FAIL with `api[method] is not a function`.

- [ ] **Step 3: Implement**

In `apps/web/src/api/client.ts`:
- Add `HoldView` to the `@gubbins/shared-types` type import.
- Replace `ApiError` and `unwrap` with:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The server's machine-readable reason for a 409 (`item_unavailable`, `hold_not_active`, …), when it sent one. */
    readonly code?: string,
  ) {
    super(message);
  }
}
```

```ts
function unwrap<T>({ data, error, response }: FetchResult<T>): T {
  if (!response.ok || data === undefined) {
    // openapi-fetch parses an error body as JSON when it can and leaves it as
    // text otherwise (e.g. a reverse proxy's HTML error page).
    const body = typeof error === 'object' && error !== null ? (error as { message?: unknown; code?: unknown }) : {};
    const message = typeof body.message === 'string' ? body.message : 'Request failed';
    const code = typeof body.code === 'string' ? body.code : undefined;
    throw new ApiError(response.status, message, code);
  }
  return data;
}
```

- Add to `api`:

```ts
  // No body: the session cookie is the credential in stack A. openapi-fetch
  // sets no Content-Type when there is no body, which Fastify requires.
  extendHold: (slug: string, holdId: string): Promise<HoldView> =>
    http.POST('/api/lists/{slug}/holds/{holdId}/extend', { params: { path: { slug, holdId } } }).then(unwrap),

  releaseHold: (slug: string, holdId: string): Promise<HoldView> =>
    http.POST('/api/lists/{slug}/holds/{holdId}/release', { params: { path: { slug, holdId } } }).then(unwrap),

  markHoldPurchased: (slug: string, holdId: string): Promise<HoldView> =>
    http.POST('/api/lists/{slug}/holds/{holdId}/purchase', { params: { path: { slug, holdId } } }).then(unwrap),
```

- [ ] **Step 4: Run, then commit**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 src/api && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/web/src/api
git commit -m "feat(web): API client for extend, release and mark purchased; ApiError carries the 409 code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 8.2: The idempotency key is minted when the hold dialog opens (fixes the skeleton bug)

**Files:**
- Create: `apps/web/src/features/holds/useHoldCredential.ts`, `useHoldCredential.test.tsx`
- Rewrite: `apps/web/src/features/holds/HoldDialog.tsx`
- Create: `apps/web/src/features/holds/HoldDialog.test.tsx`
- Rewrite: `apps/web/src/features/holds/ItemView.tsx`, `ItemView.test.tsx`

**Interfaces:**
- Consumes: `useHoldItem` (unchanged), `ListViewResponse['item']`.
- Produces:
  - `interface HoldCredential { idempotencyKey: string }`
  - `useHoldCredential(): HoldCredential` (stack E adds the seed and public key)
  - `HoldDialog` props `{ itemTitle; holdDurationDays: number; isPending; error; onConfirm(credential: HoldCredential); onClose() }`, mounted only while open
  - `ItemView` props add `holdDurationDays: number`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/holds/useHoldCredential.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHoldCredential } from './useHoldCredential';

describe('useHoldCredential', () => {
  it('mints the idempotency key once, when it mounts, and keeps it across re-renders', () => {
    const { result, rerender } = renderHook(() => useHoldCredential());
    const minted = result.current.idempotencyKey;

    rerender();
    rerender();

    expect(result.current.idempotencyKey).toBe(minted);
    expect(minted).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('mints a fresh key for each mount — each opening of the dialog', () => {
    const first = renderHook(() => useHoldCredential()).result.current.idempotencyKey;
    const second = renderHook(() => useHoldCredential()).result.current.idempotencyKey;
    expect(second).not.toBe(first);
  });
});
```

Create `apps/web/src/features/holds/HoldDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HoldDialog, type HoldDialogProps } from './HoldDialog';

function renderDialog(overrides: Partial<HoldDialogProps> = {}) {
  const props: HoldDialogProps = {
    itemTitle: 'Stroller', holdDurationDays: 3, isPending: false, error: null,
    onConfirm: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  return { props, ...render(<HoldDialog {...props} />) };
}

describe('HoldDialog', () => {
  it('states the hold duration plainly', () => {
    renderDialog();
    expect(screen.getByText('Held for you for 3 days.')).toBeInTheDocument();
  });

  it('says "1 day", not "1 days"', () => {
    renderDialog({ holdDurationDays: 1 });
    expect(screen.getByText('Held for you for 1 day.')).toBeInTheDocument();
  });

  it('confirms with the same key however many times it is tapped while open', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    const [[first], [second]] = vi.mocked(props.onConfirm).mock.calls;
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('cannot be cancelled or escaped while the hold is in flight', () => {
    renderDialog({ isPending: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Holding…' })).toBeDisabled();
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('can be escaped when nothing is in flight', () => {
    renderDialog();
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  });

  it('shows a failed hold in an alert', () => {
    renderDialog({ error: new Error('This item is no longer available.') });
    expect(screen.getByRole('alert')).toHaveTextContent('This item is no longer available.');
  });
});
```

Replace `apps/web/src/features/holds/ItemView.test.tsx` with:

```tsx
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { ItemView } from './ItemView';

const heldView: HoldView = {
  holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z',
  extendedAt: null, actions: { extend: true, release: true, purchase: true },
};

function renderItem(status: ListViewResponse['item']['status']): void {
  const ui: ReactElement = (
    <ItemView slug="abc123" listTitle="Baby Shower" holdDurationDays={3} item={{ id: 'item-1', title: 'Stroller', status }} />
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
}

/** Records the idempotency key of every hold request; answers each with the next status given. */
function holdEndpoint(...statuses: number[]) {
  const keys: string[] = [];
  server.use(http.post('/api/lists/abc123/items/item-1/hold', async ({ request }) => {
    keys.push(((await request.json()) as { idempotencyKey: string }).idempotencyKey);
    const status = statuses[keys.length - 1] ?? 201;
    return status === 201 ? HttpResponse.json(heldView, { status }) : HttpResponse.json({ message: 'Request failed' }, { status });
  }));
  return keys;
}

describe('ItemView', () => {
  it('opens the hold dialog from an available item and closes it once the hold succeeds', async () => {
    holdEndpoint(201);
    const user = userEvent.setup();
    renderItem('available');

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    expect(screen.getByText('Held for you for 3 days.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
  });

  it('sends the key minted at opening on every retry — not a fresh one per tap (ADR-0048)', async () => {
    const keys = holdEndpoint(503, 201);
    const user = userEvent.setup();
    renderItem('available');

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('mints a new key for a new opening, and forgets the old error', async () => {
    const keys = holdEndpoint(503, 503);
    const user = userEvent.setup();
    renderItem('available');

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it.each([
    ['held', 'Stroller is held.'],
    ['purchased', 'Stroller has been purchased.'],
  ] as const)('shows a %s item as such, with no Hold button', (status, message) => {
    renderItem(status);
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Hold this item' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 src/features/holds`
Expected: FAIL. `./useHoldCredential` is missing, `holdDurationDays` is unknown, the duration line is absent, and the retry test's two keys differ.

- [ ] **Step 3: Implement**

Create `apps/web/src/features/holds/useHoldCredential.ts`:

```ts
import { useState } from 'react';

export interface HoldCredential {
  idempotencyKey: string;
}

/**
 * The credential a hold submit carries, minted once when the hold dialog
 * opens (a lazy state initializer) — never per tap, which would give every
 * retry a fresh key and defeat ADR-0048 (guest UX: "generated when the
 * sheet is opened"). The dialog mounts on open and unmounts on close, so
 * each opening has its own key and every re-render or retry within one
 * opening reuses it. Stack E adds the Ed25519 seed and public key here.
 */
export function useHoldCredential(): HoldCredential {
  const [credential] = useState<HoldCredential>(() => ({ idempotencyKey: crypto.randomUUID() }));
  return credential;
}
```

Replace `apps/web/src/features/holds/HoldDialog.tsx` with:

```tsx
import { useEffect, useRef, type SyntheticEvent } from 'react';
import { useHoldCredential, type HoldCredential } from './useHoldCredential';

export interface HoldDialogProps {
  itemTitle: string;
  holdDurationDays: number;
  isPending: boolean;
  error: Error | null;
  onConfirm: (credential: HoldCredential) => void;
  onClose: () => void;
}

/**
 * A real <dialog> (ADR-0024), mounted only while open: opening it is what
 * mints the hold's credential, so a guest who taps "Yes, hold it" twice on
 * slow venue wifi sends one key twice and gets one hold. It cannot be
 * dismissed while the hold is in flight, so the outcome lands where the
 * guest is looking.
 */
export function HoldDialog({ itemTitle, holdDurationDays, isPending, error, onConfirm, onClose }: HoldDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const credential = useHoldCredential();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.open = true; // jsdom test environment only — showModal isn't implemented there
    }
  }, []);

  // Escape fires `cancel` before the dialog closes; refusing it keeps the
  // dialog up until the request settles.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (isPending) event.preventDefault();
  }

  const duration = `${holdDurationDays} ${holdDurationDays === 1 ? 'day' : 'days'}`;

  return (
    <dialog ref={dialogRef} onCancel={handleCancel} onClose={onClose} aria-labelledby="hold-dialog-title" className="rounded-lg p-6 backdrop:bg-black/50">
      <p id="hold-dialog-title" className="mb-2">Hold &ldquo;{itemTitle}&rdquo; for yourself?</p>
      <p className="mb-4 text-slate-700">Held for you for {duration}.</p>
      {error && <p role="alert" className="mb-4 text-red-600">{error.message}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => onConfirm(credential)} disabled={isPending} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {isPending ? 'Holding…' : 'Yes, hold it'}
        </button>
        <button type="button" onClick={onClose} disabled={isPending} className="min-h-11 rounded border px-4 py-2 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
```

Replace `apps/web/src/features/holds/ItemView.tsx` with:

```tsx
import { useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { HoldDialog } from './HoldDialog';
import { HeldAnnouncement } from './HeldAnnouncement';

export interface ItemViewProps {
  slug: string;
  listTitle: string;
  item: ListViewResponse['item'];
  holdDurationDays: number;
}

export function ItemView({ slug, listTitle, item, holdDurationDays }: ItemViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { mutate, isPending, error, reset } = useHoldItem(slug, item.id);

  function closeDialog() {
    setDialogOpen(false);
    // The next opening starts clean: no stale error from this one.
    reset();
  }

  // Status comes from the server alone. useHoldItem stays pending until the
  // refetched list view lands, and a remembered local success would go stale
  // the moment the guest releases or buys from "Your holds".
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{listTitle}</h1>
      <p>{item.title}</p>
      {item.status === 'available' ? (
        <button type="button" onClick={() => setDialogOpen(true)} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white">
          Hold this item
        </button>
      ) : (
        <HeldAnnouncement message={item.status === 'held' ? `${item.title} is held.` : `${item.title} has been purchased.`} />
      )}
      {dialogOpen && (
        <HoldDialog
          itemTitle={item.title}
          holdDurationDays={holdDurationDays}
          isPending={isPending}
          error={error}
          onConfirm={(credential) => mutate({ idempotencyKey: credential.idempotencyKey }, { onSuccess: () => setDialogOpen(false) })}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
```

In `apps/web/src/pages/ListPage.tsx`, pass the new prop so the page compiles (Task 8.4 finishes the page):

```tsx
      <ItemView slug={slug} listTitle={query.data.title} item={query.data.item} holdDurationDays={query.data.capabilities.holdDurationDays} />
```

- [ ] **Step 4: Run, then commit**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 && npx tsc --noEmit && npx eslint src`
Expected: PASS. The `react-hooks` lint accepts `crypto.randomUUID()` inside the lazy initializer.

```bash
git add apps/web/src
git commit -m "fix(web): mint the hold's idempotency key when the dialog opens, not per tap

The dialog now mounts on open, states the hold duration, and cannot be
dismissed while the hold is in flight.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 8.3: "Your holds" with extend, release and mark purchased (Review Focus 2 and 3)

**Files:**
- Create: `apps/web/src/features/holds/formatExpiry.ts`
- Create: `apps/web/src/features/holds/useHoldAction.ts`
- Create: `apps/web/src/features/holds/HoldActions.tsx`
- Create: `apps/web/src/features/holds/YourHolds.tsx`, `YourHolds.test.tsx`

**Interfaces:**
- Consumes: Task 8.1's client methods, `listViewKey`, `useListView`.
- Produces:
  - `formatExpiry(iso: string): string`
  - `type HoldAction = 'extend' | 'release' | 'purchase'`
  - `useHoldAction(slug: string, action: HoldAction, onSuccess?: (view: HoldView) => void)`
  - `HoldActions` props `{ slug; hold: HoldView; itemTitle; onAnnounce(message: string) }`
  - `YourHolds` props `{ slug: string; holds: HoldView[]; itemTitles: Record<string, string> }`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/holds/YourHolds.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { useListView } from './useListView';
import { YourHolds } from './YourHolds';
import { formatExpiry } from './formatExpiry';

const EXPIRES = '2026-01-04T00:00:00.000Z';
const EXTENDED_EXPIRES = '2026-01-07T00:00:00.000Z';
const active: HoldView = { holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: EXPIRES, extendedAt: null, actions: { extend: true, release: true, purchase: true } };
const extended: HoldView = { ...active, expiresAt: EXTENDED_EXPIRES, extendedAt: '2026-01-02T00:00:00.000Z', actions: { extend: false, release: true, purchase: true } };
const expiredBuyable: HoldView = { ...active, status: 'expired', actions: { extend: false, release: false, purchase: true } };
const purchased: HoldView = { ...active, status: 'purchased', actions: { extend: false, release: false, purchase: false } };

const list = (myHolds: HoldView[]): ListViewResponse => ({
  title: 'Baby Shower', item: { id: 'item-1', title: 'Stroller', status: myHolds.length ? 'held' : 'available' },
  myHolds, capabilities: { holdDurationDays: 3 },
});

/** Serves each list view in turn on successive GETs, then keeps serving the last one. */
function listViews(...views: ListViewResponse[]) {
  let served = 0;
  server.use(http.get('/api/lists/abc123', () => HttpResponse.json(views[Math.min(served++, views.length - 1)])));
}

/** YourHolds fed by a live list-view query, as ListPage feeds it. */
function Harness() {
  const query = useListView('abc123');
  return query.data ? <YourHolds slug="abc123" holds={query.data.myHolds} itemTitles={{ 'item-1': 'Stroller' }} /> : null;
}

async function renderYourHolds() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  return screen.findByRole('region', { name: 'Your holds' });
}

describe('YourHolds', () => {
  it('shows an active hold with its expiry and every action the server offers', async () => {
    listViews(list([active]));
    const region = await renderYourHolds();

    expect(within(region).getByText(`Held until ${formatExpiry(EXPIRES)}.`)).toBeInTheDocument();
    for (const name of ['Mark as purchased', 'Extend hold', 'Release hold']) {
      expect(within(region).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('offers only purchase on an expired hold the server says can still be bought', async () => {
    listViews(list([expiredBuyable]));
    const region = await renderYourHolds();

    expect(within(region).getByText(`Your hold expired on ${formatExpiry(EXPIRES)}. You can still mark it as purchased.`)).toBeInTheDocument();
    expect(within(region).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mark as purchased']);
  });

  it('shows a purchased hold as done, with no actions', async () => {
    listViews(list([purchased]));
    const region = await renderYourHolds();

    expect(within(region).getByText('Marked as purchased.')).toBeInTheDocument();
    expect(within(region).queryAllByRole('button')).toEqual([]);
  });

  it('says where holds will appear when there are none', async () => {
    listViews(list([]));
    expect(within(await renderYourHolds()).getByText('Holds you place appear here.')).toBeInTheDocument();
  });

  it('extends, announces the new expiry, and stops offering extend', async () => {
    listViews(list([active]), list([extended]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 200, extended));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent(`Hold extended until ${formatExpiry(EXTENDED_EXPIRES)}.`));
    expect(within(region).queryByRole('button', { name: 'Extend hold' })).not.toBeInTheDocument();
    expect(within(region).getByText(`Held until ${formatExpiry(EXTENDED_EXPIRES)} (extended).`)).toBeInTheDocument();
  });

  it('asks before releasing, and still announces the release once the hold has gone', async () => {
    listViews(list([active]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    expect(within(region).getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Keep my hold' }));
    expect(within(region).getByRole('button', { name: 'Release hold' })).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(within(region).getByText('Holds you place appear here.')).toBeInTheDocument());
    expect(within(region).getByRole('status')).toHaveTextContent('Your hold on Stroller is released.');
  });

  it('explains a refusal and refetches, so the card shows the hold as it really is (Review Focus 2)', async () => {
    listViews(list([active]), list([expiredBuyable]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    expect(await within(region).findByRole('alert')).toHaveTextContent('This hold is no longer active.');
    await waitFor(() => expect(within(region).queryByRole('button', { name: 'Extend hold' })).not.toBeInTheDocument());
    expect(within(region).getByText(/^Your hold expired on /)).toBeInTheDocument();
  });

  it('disables every action on the hold while one is in flight, so a double tap sends one request (Review Focus 3)', async () => {
    listViews(list([active]));
    let requests = 0;
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => { respond = resolve; });
    server.use(http.post('/api/lists/abc123/holds/hold-1/purchase', async () => {
      requests += 1;
      await responded;
      return HttpResponse.json(purchased);
    }));
    const user = userEvent.setup();
    const region = await renderYourHolds();
    const buy = within(region).getByRole('button', { name: 'Mark as purchased' });

    await user.click(buy);
    await user.click(buy);

    for (const button of within(region).getAllByRole('button')) expect(button).toBeDisabled();
    expect(requests).toBe(1);

    // Let the one request finish inside the test, so nothing settles after teardown.
    respond();
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 src/features/holds/YourHolds.test.tsx`
Expected: FAIL. `./YourHolds` and `./formatExpiry` cannot be resolved.

- [ ] **Step 3: Implement**

Create `apps/web/src/features/holds/formatExpiry.ts`:

```ts
/**
 * An expiry instant in the guest's own locale and time zone. List time
 * zones arrive with sub-project 4; until then the browser's is the most
 * useful one to show.
 */
export function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
```

Create `apps/web/src/features/holds/useHoldAction.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HoldView } from '@gubbins/shared-types';
import { api } from '../../api/client';
import { listViewKey } from './useListView';

export type HoldAction = 'extend' | 'release' | 'purchase';

const call: Record<HoldAction, (slug: string, holdId: string) => Promise<HoldView>> = {
  extend: api.extendHold,
  release: api.releaseHold,
  purchase: api.markHoldPurchased,
};

/**
 * One action on one hold. Settles by refetching the list view: after a
 * success the item's status changed, and after a 409 the page was stale —
 * the hold lapsed, or another tab acted — so the refetch is what shows the
 * guest the real state. Stays pending until that refetch lands, like
 * useHoldItem.
 *
 * `onSuccess` is a hook-level option rather than a `mutate` callback on
 * purpose: a released hold drops out of the refetched list and its
 * component unmounts, and TanStack skips `mutate` callbacks for an
 * unmounted component — the release would never be announced.
 */
export function useHoldAction(slug: string, action: HoldAction, onSuccess?: (view: HoldView) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holdId: string) => call[action](slug, holdId),
    onSuccess,
    onSettled: () => queryClient.invalidateQueries({ queryKey: listViewKey(slug) }),
  });
}
```

Create `apps/web/src/features/holds/HoldActions.tsx`:

```tsx
import { useState } from 'react';
import type { HoldView } from '@gubbins/shared-types';
import { useHoldAction } from './useHoldAction';
import { formatExpiry } from './formatExpiry';

export interface HoldActionsProps {
  slug: string;
  hold: HoldView;
  itemTitle: string;
  onAnnounce: (message: string) => void;
}

const primary = 'min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50';
const secondary = 'min-h-11 rounded border px-4 py-2 disabled:opacity-50';

/**
 * The buttons one hold offers — exactly the server's `actions`, never
 * re-derived here (holds-lifecycle §5). Stack E reuses this on the hold-link
 * page. While any action on the hold is in flight, every button is
 * disabled, so a double tap on slow wifi sends one request.
 */
export function HoldActions({ slug, hold, itemTitle, onAnnounce }: HoldActionsProps) {
  const extend = useHoldAction(slug, 'extend', (view) => onAnnounce(`Hold extended until ${formatExpiry(view.expiresAt)}.`));
  const release = useHoldAction(slug, 'release', () => onAnnounce(`Your hold on ${itemTitle} is released.`));
  const purchase = useHoldAction(slug, 'purchase', () => onAnnounce(`${itemTitle} is marked as purchased. Thank you!`));
  const [confirmingRelease, setConfirmingRelease] = useState(false);

  const mutations = [extend, release, purchase];
  const pending = mutations.some((m) => m.isPending);
  const error = mutations.find((m) => m.error)?.error ?? null;

  function run(mutation: typeof extend) {
    for (const m of mutations) m.reset();
    mutation.mutate(hold.holdId);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {hold.actions.purchase && (
          <button type="button" disabled={pending} onClick={() => run(purchase)} className={primary}>Mark as purchased</button>
        )}
        {hold.actions.extend && (
          <button type="button" disabled={pending} onClick={() => run(extend)} className={secondary}>Extend hold</button>
        )}
        {hold.actions.release && !confirmingRelease && (
          <button type="button" disabled={pending} onClick={() => setConfirmingRelease(true)} className={secondary}>Release hold</button>
        )}
      </div>
      {hold.actions.release && confirmingRelease && (
        <div role="group" aria-labelledby={`release-${hold.holdId}`} className="space-y-2 rounded border border-slate-300 p-3">
          <p id={`release-${hold.holdId}`}>Release your hold on {itemTitle}? Someone else will be able to hold it.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => { setConfirmingRelease(false); run(release); }} className={primary}>
              Yes, release it
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirmingRelease(false)} className={secondary}>Keep my hold</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-red-600">{error.message}</p>}
    </div>
  );
}
```

Create `apps/web/src/features/holds/YourHolds.tsx`:

```tsx
import { useState } from 'react';
import type { HoldView } from '@gubbins/shared-types';
import { HoldActions } from './HoldActions';
import { formatExpiry } from './formatExpiry';

export interface YourHoldsProps {
  slug: string;
  holds: HoldView[];
  itemTitles: Record<string, string>;
}

function statusLine(hold: HoldView): string {
  switch (hold.status) {
    case 'active':
      return `Held until ${formatExpiry(hold.expiresAt)}${hold.extendedAt ? ' (extended)' : ''}.`;
    case 'expired':
      return hold.actions.purchase
        ? `Your hold expired on ${formatExpiry(hold.expiresAt)}. You can still mark it as purchased.`
        : `Your hold expired on ${formatExpiry(hold.expiresAt)}.`;
    case 'purchased':
      return 'Marked as purchased.';
    case 'released':
      return 'Released.';
  }
}

/**
 * "Your holds" (holds-lifecycle §5): this session's holds, each with its
 * expiry and the actions it offers. The live region stays mounted even when
 * the list empties, so a release is still announced after the last hold
 * disappears (ADR-0025).
 */
export function YourHolds({ slug, holds, itemTitles }: YourHoldsProps) {
  const [announcement, setAnnouncement] = useState('');

  return (
    <section aria-labelledby="your-holds-heading" className="space-y-3">
      <h2 id="your-holds-heading" className="text-lg font-semibold">Your holds</h2>
      <p role="status" aria-live="polite" className="font-medium text-green-700">{announcement}</p>
      {holds.length === 0 ? (
        <p className="text-slate-600">Holds you place appear here.</p>
      ) : (
        <ul className="space-y-3">
          {holds.map((hold) => {
            const itemTitle = itemTitles[hold.itemId] ?? 'This item';
            return (
              <li key={hold.holdId} className="space-y-2 rounded border border-slate-200 bg-white p-4">
                <h3 className="font-medium">{itemTitle}</h3>
                <p>{statusLine(hold)}</p>
                <HoldActions slug={slug} hold={hold} itemTitle={itemTitle} onAnnounce={setAnnouncement} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, then commit**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 src/features/holds && npx tsc --noEmit && npx eslint src`
Expected: PASS.

```bash
git add apps/web/src/features/holds
git commit -m "feat(web): Your holds — extend, release (confirmed) and mark purchased, announced via aria-live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 8.4: The list page shows "Your holds"

**Files:**
- Modify: `apps/web/src/pages/ListPage.tsx`
- Create: `apps/web/src/pages/ListPage.test.tsx`

**Interfaces:**
- Consumes: `ItemView` (Task 8.2), `YourHolds` (Task 8.3).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/ListPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../test/msw/server';
import ListPage from './ListPage';

const hold: HoldView = {
  holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z',
  extendedAt: null, actions: { extend: true, release: true, purchase: true },
};
const view = (held: boolean): ListViewResponse => ({
  title: 'Baby Shower',
  item: { id: 'item-1', title: 'Stroller', status: held ? 'held' : 'available' },
  myHolds: held ? [hold] : [],
  capabilities: { holdDurationDays: 3 },
});

function renderListPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/abc123']}>
        <Routes><Route path="/:slug" element={<ListPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ListPage', () => {
  it('holds the item, then shows it held and under "Your holds" with its actions', async () => {
    let held = false;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/items/item-1/hold', () => { held = true; return HttpResponse.json(hold, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: 'Hold this item' }));
    expect(screen.getByText('Held for you for 3 days.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    const yourHolds = screen.getByRole('region', { name: 'Your holds' });
    expect(await within(yourHolds).findByRole('button', { name: 'Extend hold' })).toBeInTheDocument();
    expect(screen.getByText('Stroller is held.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 src/pages/ListPage.test.tsx`
Expected: FAIL. No region named "Your holds" is rendered.

- [ ] **Step 3: Implement**

In `apps/web/src/pages/ListPage.tsx`, add `import { YourHolds } from '../features/holds/YourHolds';` and replace the final `return` with:

```tsx
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-sm space-y-8">
        <ItemView
          slug={slug}
          listTitle={query.data.title}
          item={query.data.item}
          holdDurationDays={query.data.capabilities.holdDurationDays}
        />
        <YourHolds slug={slug} holds={query.data.myHolds} itemTitles={{ [query.data.item.id]: query.data.item.title }} />
      </div>
    </main>
  );
```

- [ ] **Step 4: Run, then commit**

Run (from `apps/web`): `npx vitest run --testTimeout=30000 && npx tsc --noEmit && npx eslint src`
Expected: PASS.

```bash
git add apps/web/src/pages
git commit -m "feat(web): the list page shows Your holds beside the item

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

### Task 8.5: E2E — key → hold → extend → mark purchased, and release

**Files:**
- Create: `e2e/guest-manages-a-hold.spec.ts`
- Modify: `e2e/walking-skeleton.spec.ts:26-33`

- [ ] **Step 1: Write the e2e spec**

Create `e2e/guest-manages-a-hold.spec.ts`:

```ts
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The owner makes a one-item list; a second tab in the same context stands in for the guest, keyed in. */
async function guestOnNewList(page: Page, context: BrowserContext): Promise<Page> {
  await page.goto('/');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('First item').fill('Stroller');
  await page.getByRole('button', { name: 'Create list' }).click();
  const guestLink = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();

  const guest = await context.newPage();
  await guest.goto(guestLink!);
  await guest.getByLabel('Enter the guest key').fill(guestKey!);
  await guest.getByRole('button', { name: 'View list' }).click();
  await expect(guest.getByRole('heading', { name: 'Your holds' })).toBeVisible();
  return guest;
}

/** ADR-0026: CI blocks on serious and critical axe violations only. */
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('a guest holds the item, extends the hold once, and marks it purchased', async ({ page, context }) => {
  const guest = await guestOnNewList(page, context);
  const yourHolds = guest.getByRole('region', { name: 'Your holds' });

  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await expect(guest.getByText('Held for you for 3 days.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await guest.getByRole('button', { name: 'Yes, hold it' }).click();

  await expect(guest.getByText('Stroller is held.')).toBeVisible();
  await expect(yourHolds.getByText(/^Held until .*\.$/)).toBeVisible();

  await yourHolds.getByRole('button', { name: 'Extend hold' }).click();
  await expect(yourHolds.getByRole('status')).toHaveText(/^Hold extended until /);
  await expect(yourHolds.getByRole('button', { name: 'Extend hold' })).toHaveCount(0);

  // The extension is the server's, not the page's: it survives a reload.
  await guest.reload();
  await expect(yourHolds.getByText(/\(extended\)\.$/)).toBeVisible();
  await expect(yourHolds.getByRole('button', { name: 'Extend hold' })).toHaveCount(0);
  await expectNoSeriousAxeViolations(guest);

  await yourHolds.getByRole('button', { name: 'Mark as purchased' }).click();
  await expect(yourHolds.getByRole('status')).toHaveText('Stroller is marked as purchased. Thank you!');
  await expect(yourHolds.getByText('Marked as purchased.')).toBeVisible();
  await expect(guest.getByText('Stroller has been purchased.')).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Hold this item' })).toHaveCount(0);
});

test('a guest releases a hold after confirming, and the item can be held again', async ({ page, context }) => {
  const guest = await guestOnNewList(page, context);
  const yourHolds = guest.getByRole('region', { name: 'Your holds' });
  await guest.getByRole('button', { name: 'Hold this item' }).click();
  await guest.getByRole('button', { name: 'Yes, hold it' }).click();

  await yourHolds.getByRole('button', { name: 'Release hold' }).click();
  await expect(yourHolds.getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toBeVisible();
  await expectNoSeriousAxeViolations(guest);
  await yourHolds.getByRole('button', { name: 'Yes, release it' }).click();

  await expect(yourHolds.getByRole('status')).toHaveText('Your hold on Stroller is released.');
  await expect(yourHolds.getByText('Holds you place appear here.')).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Hold this item' })).toBeVisible();
});
```

- [ ] **Step 2: Keep the walking-skeleton spec unambiguous**

The page now has two `role="status"` regions (the item's and "Your holds"'), and the dialog is no longer in the DOM while closed. In `e2e/walking-skeleton.spec.ts`, replace lines 26–33 with:

```ts
  // exact: true — once the item is held, "Your holds" repeats the title in
  // its card, and a substring match would be ambiguous under strict mode.
  await expect(guestPage.getByText('Stroller', { exact: true })).toBeVisible();
  await guestPage.getByRole('button', { name: 'Hold this item' }).click();
  await guestPage.getByRole('button', { name: 'Yes, hold it' }).click();
  await expect(guestPage.getByText('Stroller is held.')).toBeVisible();
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: 3 tests pass (the walking skeleton plus the two above).

- [ ] **Step 4: Run the whole bar**

Run: `npm run lint && npm test && npm run build && npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit and open PR 8**

```bash
git add e2e
git commit -m "test(e2e): a guest holds, extends once, marks purchased, and releases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
git push -u origin feat/holds-a/08-web-e2e
```

Open the PR against `feat/holds-a/07-rebuild`. Its description lists the stack's definition of done:

- Holds expire lazily.
- Holds extend once, release and mark purchased from "Your holds".
- `HOLD_DURATION_DAYS` is configurable.
- The idempotency key is minted at dialog open.
- Events carry the `actor` envelope and `v: 1`.
- Active-hold loading has contract suites.
- Units of work run under `BEGIN IMMEDIATE`.
- Concurrency tests and the minimal `rebuildProjections` ship.
- ADR-0078 records the aggregate root.
- `saveItemState` replaces `markHeld`.

## After the stack merges

- Merge the PRs in order 1 → 8 as merge commits. If any is squash-merged instead, rebase the next branch `--onto main` before retargeting it (memory: squash-merged stacks strand their bases).
- Recreate local dev databases.
- Stacks B, D and E may then be planned (D20). Before B, re-read §2 and §3 of the spec against what this stack actually built. In particular, `HoldRepository.findForSession` and `findBySlug(slug, now)` are additions the later plans should build on.
