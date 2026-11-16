# "I'm buying this" (release 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest can tap "I'm buying this" on a single gift and, in one step, hold and mark purchased the units they pick, with their name and an optional message.

**Architecture:** A new `Item.placePurchasedHold` composes `placeHold` and `purchaseHold` at one instant and returns both events at one starting sequence number. `BuyItem` (beside `HoldItem`) appends them in one call with one `guest_pii` row. A new `POST …/items/:itemId/buy` route serves it. The web reuses `HoldDialog` in a `buy` mode, and `ItemView` leads with the new button.

**Tech Stack:** TypeScript, Fastify + zod (fastify-type-provider-zod), Kysely, Vitest, React + TanStack Query, openapi-fetch, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-buying-now-design.md`: the "Release 1" sections and the release 1 rows of Concurrency and Tests. Owner rulings: `.superpowers/sdd/2026-11-16-buying-now/rulings.md` in the spec's worktree, copied into this branch's SDD folder.

## Global Constraints

- At most 10 changed files per PR, generated files and tests included (`git diff --stat <base>...HEAD | tail -1`). One route or contract change per PR. Docs go in their own PR.
- No plan IDs, task numbers or branch names in code, comments, test names, commits or PR bodies.
- Copy, verbatim from the spec (straight quotes in the spec are curly in the UI, as the hold sheet does):
  - Card button: `I'm buying this`, with sr-only `: {title}`, primary style, before `Hold this item` (secondary style).
  - Sheet title: `Buying "{title}"?`
  - Note, one unit: **`Tap "Yes, I'm buying it" before you buy it.`** then `Other guests will then see it's taken, so no one else buys it while you're getting it. It can't be undone, so only tap it if you're sure.`
  - Note, N > 1: **`Tap "Yes, I'm buying N" before you buy them.`** then `Other guests will then see they're taken, so no one else buys them while you're getting them. It can't be undone, so only tap it if you're sure.`
  - Confirm: `Yes, I'm buying it` / `Yes, I'm buying N`; pending `Saving…`; `Cancel`.
  - Message label: `Message to the owner (optional)`, at most 300 characters.
  - Success: `{title} is marked as purchased. Thank you!` (one unit) / `{title}: N marked as purchased. Thank you!` (N > 1).
  - Explainer heading `How claiming a gift works` and its three steps as in the spec.
- Buy route answers 201; errors as the hold route (409 `item_unavailable`, 409 no code, 400, 404).
- Unit wording is "wanted", never "left".
- Each PR is verified with skill verifying-gubbins-locally (`scripts/verify.sh`, `--e2e` for any PR into main).

## Review Focus

1. **A guest whose session lapsed taps "I'm buying this":** nothing is written and the guest sees the generic not-found. Pinned in Task 1 (use case) and Task 2 (route).
2. **A message over 300 characters:** nothing is bought, no hold appears. `GuestDetails` owns the limit; the use case must build the details before appending. Pinned in Task 1.
3. **A double tap or retry on slow wifi:** exactly one purchase. The sheet's key is minted on open (existing `HoldDialog` behaviour, pinned there); the server replays the key. Pinned in Task 1.
4. **Fewer units free than picked by the time the guest taps:** 409 `item_unavailable`, nothing bought, the sheet retries in place. The domain refusal is `placeHold`'s, tested there; the sheet behaviour is `HoldDialog`'s, tested there. No new test.
5. **A guest who already holds some of the gift buys more:** they get a second, purchased card, and the active hold stays. Follows from composing `placeHold`; no new test.

---

### Task 1: Buying in the domain and the use case

**PR:** targets main. 5 files. `BuyItem` has no caller until Task 2's route; the PR body says so.

**Files:**
- Modify: `apps/api/src/domain/entities/Item.ts`, add the command after `placeHold` (~line 236)
- Modify: `apps/api/src/domain/entities/Wishlist.ts`, add the delegating method after `holdItem` (~line 313)
- Test: `apps/api/src/domain/entities/Item.test.ts`
- Create: `apps/api/src/application/use-cases/BuyItem.ts`
- Test: `apps/api/src/application/use-cases/BuyItem.test.ts` (new; copy `HoldItem.test.ts`'s setup)

**Interfaces:**
- Produces:
  - `Item.placePurchasedHold(props: { sessionHash: string; idempotencyKey: string; durationMs: number; piiRef: string; units: number }, tokens: { generateEntityId(): string; generateHoldSecret(): string }, hasher: { hash(value: string): string }): { hold: Hold; events: [ItemHeldEvent, ItemPurchasedEvent]; expectedSeq: number }`
  - `Wishlist.buyItem(props: { itemId: string } & <the same props>, tokens, hasher): { item: Item; hold: Hold; events: [ItemHeldEvent, ItemPurchasedEvent]; expectedSeq: number }`
  - `interface BuyItemInput { wishlistId: string; itemId: string; idempotencyKey: string; name: string; units: number; message?: string }`
  - `class BuyItem { constructor(unitOfWork: UnitOfWork, tokenGenerator: TokenGenerator, clock: Clock, hasher: Hasher, policy: HoldPolicy); execute(input: BuyItemInput, access: AccessContext): Promise<HoldView> }`

- [ ] **Step 1: Write the failing domain test** in `Item.test.ts`, beside the `placeHold` tests:
  `it('places a hold and buys all its units at one instant, returning both events from one starting seq')`. On a quantity-5 single item at `asOf` 2026-11-16T12:00:00Z with seq 7, `placePurchasedHold({ …, units: 2 })`:
  - `result.expectedSeq` is 7, and `result.events.map((e) => e.type)` is `['ItemHeld', 'ItemPurchased']`;
  - both events' `occurredAt` are `'2026-11-16T12:00:00.000Z'`, and the `ItemPurchased` event's `units` is 2;
  - `result.hold.statusAt(asOf)` is `'purchased'` and `result.hold.purchasedUnits` is 2;
  - `item.availableUnits()` is 3.

  Unit and group-gift refusals are `placeHold`'s and stay tested there; don't repeat them.
- [ ] **Step 2: Run it and see it fail:** `scripts/verify.sh --quick apps/api src/domain/entities/Item.test.ts` fails with "placePurchasedHold is not a function".
- [ ] **Step 3: Implement `Item.placePurchasedHold`.** Call `placeHold`, then `purchaseHold(hold, hold.units)`. Return the first call's `expectedSeq`, which is the seq to append both events at, since `recordEvent` advanced once per event. Doc comment: "Reach it through `Wishlist.buyItem`." Then `Wishlist.buyItem`, shaped like `holdItem`: `getItem(props.itemId)`, then `{ item, ...item.placePurchasedHold(props, tokens, hasher) }`.
- [ ] **Step 4: Run it and see it pass** (same command).
- [ ] **Step 5: Write the failing use-case tests** in `BuyItem.test.ts`, with `FixedClock`, `InMemoryStore` and the fakes `HoldItem.test.ts` uses:
  - `it('appends the held and purchased events in one append as the guest, and stores the name and message in one details row')`: one `append` call recorded for the item, with `events` types `['ItemHeld', 'ItemPurchased']`, `expectedSeq` equal to the item's seq before the call, and actor `'guest'`. Exactly one `guest_pii` row, `{ name: 'Ada', message: 'See you Saturday' }`, whose id is the hold's `piiRef`. The returned view has `status: 'purchased'` and `purchasedUnits` equal to `units`.
  - `it('replays the first purchase for a repeated idempotency key, appending nothing more')`: a second `execute` with the same key returns a view with the same `holdId`, and the append count and `guest_pii` row count are unchanged.
  - `it('refuses a 301-character message without appending or storing anything')`: rejects with `DomainValidationError`, no append, no `guest_pii` row.
  - `it('throws ItemNotFoundError without a guest session, appending nothing')`.
- [ ] **Step 6: Run them and see them fail:** `scripts/verify.sh --quick apps/api src/application/use-cases/BuyItem.test.ts` fails because the module is missing.
- [ ] **Step 7: Implement `BuyItem`.** Follow `HoldItem.execute` step for step: the guest guard, `findById` at `clock.now()`, and replay via `findHoldForReplay` before anything else. Then `GuestDetails.from({ name, message })` before any write, the `piiRef` minted by the use case, and `wishlist.buyItem(...)`. Then `append(item.id.value, expectedSeq, events, 'guest')`, `guestPii.insert`, and `wishlists.save`. Keep `HoldItem`'s why-comments wherever the same reason applies. Sharing code with `HoldItem` is optional: duplicate the guard and replay steps rather than add a helper with one caller each.
- [ ] **Step 8: Run them and see them pass.**
- [ ] **Step 9: Verify and commit:** `scripts/verify.sh` on a clean tree, then commit "feat(api): buy a gift in one step, holding and purchasing it together".

### Task 2: The buy route and its contract

**PR:** builds on Task 1. 9 files.

**Files:**
- Modify: `packages/shared-types/src/holdItem.ts`: add `buyItemRequestSchema`, `BuyItemRequest`, `buyItemResponseSchema` (exported through the existing barrel)
- Modify: `apps/api/src/presentation/routes.ts`: add the route after the hold route (~line 344)
- Modify: `apps/api/src/presentation/compositionRoot.ts`: `buyItem: BuyItem` in the deps type, built with the same arguments as `holdItem`
- Modify: `apps/api/src/presentation/openApiDocument.ts`: `buyItem: unusedDependency('buyItem')`
- Modify: `apps/api/src/presentation/openApiDocument.test.ts`: `buyItem: ['201', '400', '404', '409']` in the statuses table
- Test: `apps/api/src/presentation/routes.integration.test.ts`
- Generated: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (`npm run gen:api`)
- Modify: `packages/shared-types/src/index.ts` only if the barrel doesn't already re-export `holdItem.ts` (it does today, so expect 8 files)

**Interfaces:**
- Consumes: `BuyItem.execute(input: BuyItemInput, access)` from Task 1.
- Produces:
  - `buyItemRequestSchema = holdItemRequestSchema.extend({ message: z.string().optional() })`. It extends the hold schema, so it needs no schema rows of its own; text isn't limited at the schema, per AGENTS.md.
  - `buyItemResponseSchema = holdViewSchema`.
  - Route `POST /api/lists/:slug/items/:itemId/buy`, `operationId: 'buyItem'`.

- [ ] **Step 1: Write the failing route tests** in `routes.integration.test.ts`, beside the hold route's:
  - `it('buys 2 of the item for the session and answers 201 with the purchased hold')`: 201, body `status: 'purchased'` and `purchasedUnits: 2`. A follow-up GET of the list shows the item's `availableUnits` dropped by 2.
  - `it('returns 400 for a purchase without a name')`: the request lacks only `name`.
  - `it("answers the generic 404 when asked to buy another list's item")`, mirroring the hold test at ~line 428.
- [ ] **Step 2: Run them and see them fail:** `scripts/verify.sh --quick apps/api src/presentation/routes.integration.test.ts` gives 404s from the missing route.
- [ ] **Step 3: Add the schema, the route and the wiring.** The route copies the hold route's shape: `guestAccess`, then `deps.buyItem.execute({ …, message: request.body.message })`, `reply.code(201)`, and errors through `sendDomainError`. Responses:
  - 201 `'The item is bought for this session in one step; a replayed idempotency key returns the same purchase.'`
  - 400 `INVALID_REQUEST`
  - 404: the hold route's text
  - 409: the hold route's text

  The OpenAPI descriptions are user-invisible, so they may say "session" and "idempotency key".
- [ ] **Step 4: Regenerate:** `npm run gen:api`, then add the statuses row to `openApiDocument.test.ts`.
- [ ] **Step 5: Run and see them pass**, including `openApiDocument.test.ts` ("matches the committed apps/api/openapi.json").
- [ ] **Step 6: Verify and commit:** `scripts/verify.sh`, then commit "feat(api): POST a purchase without holding first".

### Task 3: "I'm buying this" on the gift card

**PR:** builds on Task 2. 10 files (at the cap).

**Files:**
- Modify: `apps/web/src/api/client.ts`: `buyItem`
- Test: `apps/web/src/api/client.test.ts`
- Modify: `apps/web/src/features/holds/useHoldItem.ts`: a `via` parameter
- Modify: `apps/web/src/features/holds/HoldDialog.tsx`: a `mode` prop
- Test: `apps/web/src/features/holds/HoldDialog.test.tsx`
- Create: `apps/web/src/features/holds/purchasedMessage.ts`
- Modify: `apps/web/src/features/holds/HoldActions.tsx`: use `purchasedMessage`
- Modify: `apps/web/src/features/holds/ItemView.tsx`
- Test: `apps/web/src/features/holds/ItemView.test.tsx`
- Test: `e2e/guest-holds-several.spec.ts`

**Interfaces:**
- Consumes: `BuyItemRequest` and the generated `/api/lists/{slug}/items/{itemId}/buy` path from Task 2.
- Produces:
  - `api.buyItem(slug: string, itemId: string, input: BuyItemRequest): Promise<HoldView>`
  - `useHoldItem(slug: string, itemId: string, via: 'hold' | 'buy' = 'hold')`: the mutation input is `BuyItemRequest` (a superset of `HoldItemRequest`), and `mutationFn` picks `api.holdItem` or `api.buyItem`. The cache update and refetch are unchanged.
  - `HoldDialogProps.mode?: 'hold' | 'buy'` (default `'hold'`, so existing callers and tests are unchanged), and `onConfirm(credential, details: { name: string; units: number; message?: string })`, where `message` is set only in `buy` mode.
  - `purchasedMessage(itemTitle: string, heldUnits: number, boughtUnits: number | null): string`, which returns the success copy above. `HoldActions`' inline `purchasedMessage` moves here unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `client.test.ts`: `it('buyItem posts the details and message to the buy route')`, mirroring the hold-route test at ~line 52.
  - `HoldDialog.test.tsx`, rendering `mode: 'buy'`. Each `it` is one behaviour:
    - `it('titles the buying sheet Buying "{title}"?')`
    - `it('tells the guest to tap "Yes, I’m buying it" before buying, and that it can’t be undone')`, with the full one-unit note text.
    - `it('quotes "Yes, I’m buying 2" in the note with 2 picked')`, with the full plural note text.
    - `it('reads "Yes, I’m buying 2" on the confirm button with 2 picked')`
    - `it('sends the message with the details in buy mode')`
    - `it('limits the message to 300 characters')`

    The lock, 409 and stepper rules are shared with hold mode and already tested; don't repeat them.
  - `ItemView.test.tsx`:
    - `it('offers "I’m buying this" exactly when it offers holding')`: on an available single item, both buttons; on a held-out one or a group gift, neither.
    - `it('puts "I’m buying this" before "Hold this item"')`: the DOM order of the two buttons.
    - `it('announces "{title} is marked as purchased. Thank you!" after buying')`, with the api mocked as the existing tests do.
  - `e2e/guest-holds-several.spec.ts`: `test('a guest buys 2 of 5 with "I\u2019m buying this", and another guest sees "Wanted: 3 more"')`. It reuses `listOfFiveOnesies` and `guestFromLink`. Steps:
    1. Click `I'm buying this`, then `One more`, fill `Gifter name(s)`, and click `Yes, I'm buying 2`.
    2. Expect the status line `Baby onesies: 2 marked as purchased. Thank you!`.
    3. "Your contributions" shows `× 2` and `Marked as purchased.`.
    4. A second browser context sees `Wanted: 3 more`.
    5. Run `expectNoSeriousAxeViolations` with the sheet open.
- [ ] **Step 2: Run them and see them fail** (one `--quick` run per unit-test file; the e2e test runs in Step 5).
- [ ] **Step 3: Implement:**
  - **`HoldDialog`'s `buy` mode** follows the mockup's order: title, stepper, note box, name field and hints, then message (`LimitedTextarea`, local `MESSAGE_MAX = 300` as `PurchaseDialog` and `ContributeDialog` do), then the alert and buttons.
  - The note box uses the `border-wax` border, as in the mockup. Leave out hold mode's subtitle and boxed "come back" note.
  - The message locks with the name once sent.
  - The error fallback is `Couldn’t buy ${itemTitle}.`
  - **`ItemView`:** a second `useHoldItem(slug, item.id, 'buy')`, and a `dialogMode` state set by whichever button opened the sheet. On a buy success, set `thanks` to `purchasedMessage(item.title, units, units)`, with the same focus move as after a hold. Cancel returns focus to the button that opened the sheet.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Verify and commit:** announce the e2e run to peer sessions, then run `scripts/verify.sh --e2e` and commit "feat(web): lead each gift with I'm buying this".

### Task 4: The explainer and the privacy page

**PR:** builds on Task 3. 4 files.

**Files:**
- Modify: `apps/web/src/features/holds/HowHoldingWorks.tsx`: heading and the three steps; `DISMISSED_KEY` unchanged
- Test: `apps/web/src/features/holds/HowHoldingWorks.test.tsx`: the region's name
- Modify: `apps/web/src/pages/ListPage.test.tsx`: the region's name, in its 3 queries
- Modify: `apps/web/src/pages/PrivacyPage.tsx:26`: "How claiming a gift works"

**Interfaces:** consumes Task 3's buttons and sheet.

- [ ] **Step 1: Write the failing tests:**
  - `HowHoldingWorks.test.tsx`: `it('leads with tapping "I’m buying this" before you buy, then holding when unsure')`. It checks the three steps' bold lead-ins in order, with `{duration}` rendered as "3 days".
- [ ] **Step 2: Run it and see it fail:** `scripts/verify.sh --quick apps/web src/features/holds/HowHoldingWorks.test.tsx`.
- [ ] **Step 3: Implement** the copy changes.
- [ ] **Step 4: Verify and commit:** `scripts/verify.sh --e2e` (announce it to peer sessions first; this PR's base chain targets main), then commit "feat(web): explain claiming a gift, leading with I'm buying this".

### Task 5: Docs for the shipped behaviour

**PR:** builds on Task 4. 2 files. Docs only.

**Files:**
- Modify: `docs/spec/holds.md:4-5`: language now includes "I'm buying this"; the guest's main action is "I'm buying this", with holding second.
- Modify: `docs/spec/guest-ux.md:38-47`: a "Buy flow" paragraph before "Hold flow", following the spec's sheet description. Hold flow stays.

- [ ] **Step 1: Edit both files** to match release 1 as built. Don't mention the undo; it isn't shipped.
- [ ] **Step 2: Verify and commit:** `scripts/verify.sh` (link check), then commit "docs: describe buying a gift in one step".
