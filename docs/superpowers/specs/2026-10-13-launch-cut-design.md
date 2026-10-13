# Launch cut: one live registry — design

**Status:** Draft
**Date:** 2026-10-13
**Target go-live:** ≈ 2026-10-27
**Roadmap:** [roadmap to full spec](../plans/2026-09-30-roadmap-to-full-spec.md)
**Amends:** the delivery order of the [holds lifecycle design](2026-09-30-holds-lifecycle-design.md)
and pulls a subset of sub-project 3 (group gifts) forward.

## Purpose

Run the owner's own registry live within about two weeks. Guests must be able
to do every item action and every group-gift action from their phones. The
owner, who is also the operator, only needs to create the list and add items.

After holds stack A, main supports one list with exactly one item. It has no
owner access, no funds, no creation gate and no production container. Following
the planned order (holds stacks B–G, then sub-project 3) would miss the date.
This design cuts the launch down to what that registry needs and defers the
rest.

**Done when** the guest and owner journeys below run end to end at a 375 px
viewport, the production container passes its CI smoke test, and the manual
go-live checklist passes on the home server.

## Decision log

| # | Decision | Why | Rejected |
|---|---|---|---|
| L1 | Creating a list **always requires `CREATE_SECRET`**; the app refuses to start when it is unset. | One operator, one list; a public site must not offer creation to strangers. Simpler than self-locking. | ADR-0014's self-lock after the first list; open creation. |
| L2 | **Owner = operator.** `/{slug}/manage` asks for `CREATE_SECRET`, held in component memory only. The add-item route checks it in constant time (ADR-0035) on every call. | Removes the owner-token session (D17 lookup, owner cookie) from the launch. One instance serves one list. | Owner-token paste and owner cookie (holds stack B), now deferred. |
| L3 | **Payment handles come from env vars:** `VENMO_HANDLE` and `ZELLE_HANDLE`, both optional. If a group gift exists and neither is set, the contribute flow says no payment method is configured. | No per-list settings UI is needed for a single list. | Per-list payment-method configuration (ADR-0044), deferred. |
| L4 | **Group gifts only**: `Item.type` is `single \| group`. A group gift's price is its target. Open-ended funds are deferred. | The owner's registry needs priced items that guests chip in toward. | Funds with optional targets; both kinds. |
| L5 | A contribution is **pledged only**, created at "I've sent it" (ADR-0050). There's no owner confirm/void yet, so the progress bar shows pledged amounts. | Guests can complete the whole flow; the owner reconciles outside the app. | Owner confirmation at launch. |
| L6 | **Overfunding is allowed.** Only the 5× target bound and the arithmetic bound apply (ADR-0047, ADR-0061). | Simplest policy; the excess stays on the item (ADR-0011). | Blocking at target. |
| L7 | **USD only**, held in `Currency`/`Money` value objects. | One currency; the value object keeps the picker cheap to add later. | Currency picker at creation. |
| L8 | **Contribute flow is trimmed:** "Cover the rest" plus a custom amount. Venmo uses an app deep link with an https fallback. Zelle shows the handle with a copy button. There's no QR code, since guests are on phones. | Phones are the only expected guest device. | ¼/⅓/½ suggestions, payment QR codes. |
| L9 | Guests give a **name and optional message** on holds and pledges, stored in `GuestPii` via `piiRef` (holds stack D, ADR-0057). There's no owner view of them yet. | The owner needs to know who gave what for thank-yous; capturing it now costs little and the view can follow. | No PII until later. |
| L10 | The **production container** targets a home server behind a tunnel: multi-stage, non-root, `/health`, SQLite on a volume, secure cookies, required `SESSION_COOKIE_SECRET`. CI builds it and smoke-tests it. | The owner's chosen hosting. | VPS or PaaS-specific configuration. |
| L11 | **Process for this push:** one plan for every track, with independent tracks in parallel. Each track's e2e test is folded into its web PR. PRs stay at 10 files or fewer, with TDD and tests at the owning layer. Spec amendments come after launch. | Fit the date without giving up reviewability. | Stack A's per-stack just-in-time plans (D20); larger PRs. |
| L12 | The schema is amended in `0001_init` in place (D14) **until go-live**. After that, every schema change is a real migration. | There's no deployed instance until launch; after it there is. | — |

## Scope

**In for launch**
- Create a list with `CREATE_SECRET` (L1).
- `/{slug}/manage` (L2). The owner adds a *single* (title, quantity ≥ 1, store
  URL, price) or a *group gift* (title, price, store URL). Items can't be edited
  or deleted after they're added.
- Guests, singles: hold → extend → release → mark purchased (stack A), with
  multiple items and units left, plus name and message on the hold.
- Guests, group gifts: progress bar, contribute flow (L8), and a pledge with
  name, message and idempotency key (ADR-0048).
- Single-column layout at 375 px.
- Production container and CI smoke test (L10).

**Deferred to after launch**
- Item images (cards show a placeholder; the store link carries the picture).
  When images come, the owner uploads files they have the right to use. The
  server never fetches or scrapes images from store sites.
- Hold cap (C), hold link (E), owner release and spoilers (F), reminders (G).
- Owner-token sessions (L2), per-list payment settings (L3).
- Owner confirm/void/reconciliation, and the owner viewing holds, pledges and
  names.
- ¼/⅓/½ suggestions, the "already sent" hint (ADR-0050), and the sm/lg grid
  breakpoints (D16).
- Open-ended funds, the custom payment method, payment QR codes, a currency
  picker, and item editing or archiving.
- Rate limiting, backups, and the privacy/GDPR surface.

## Design

### Domain

- `Wishlist.addItem` loses the single-item guard and takes a type:
  - `single` takes `{ title, url?, priceMinor?, quantity ≥ 1 }`.
  - `group` takes `{ title, url?, priceMinor }`, where the price is the target
    and the quantity is fixed at 1.
- Holds apply only to singles: `holdItem` on a group gift is a domain error.
- Availability for singles follows holds design §1: `active + purchased <
  quantity`.
- **`Contribution`** is its own aggregate, referenced by `itemId` and authorized
  through `Wishlist.pledge(...)`.
  - Fields: `id`, `itemId`, `amount: Money`, `idempotencyKey`, `piiRef`,
    `pledgedAt`.
  - It returns `ContributionPledged { contributionId, itemId, amountMinor,
    idempotencyKey, piiRef, occurredAt, v: 1 }`. The event carries
    no PII and is appended to the item's stream with actor `guest`.
- **`canAccept(amount)`** (ADR-0047/0061) rejects anything that isn't positive,
  is above `targetMinor × MAX_CONTRIBUTION_TARGET_MULTIPLE` (default 5), or is
  above `MAX_CONTRIBUTION_MINOR`. Overfunding is otherwise allowed (L6).
- The pledged total is the sum of the item's contributions, computed rather than
  stored (D21's reasoning).
- `Money { amountMinor, currency }` and `Currency` support USD only for now.

### Persistence

The changes below amend `0001_init` (L12):

```
items          + type text not null CHECK (type IN ('single','group'))
               + url text null, price_minor int null
               + CHECK (type = 'single' OR (price_minor IS NOT NULL AND quantity = 1))
wishlists      + currency text not null default 'USD'
guest_pii      NEW (holds design §2)
holds          + pii_ref references guest_pii(id)
contributions  NEW: id pk, item_id, amount_minor int CHECK (> 0), idempotency_key,
               pii_ref, pledged_at; UNIQUE (item_id, idempotency_key)
```

- The store URL must be `https:` and is validated at the trust boundary. It's
  rendered with `rel="noopener noreferrer"`.
- `rebuildProjections` re-folds `contributions` from `event_log`;
  `guest_pii` is left untouched.

### API

| Route | Credential | Body → response |
|---|---|---|
| `POST /api/lists` | `createSecret` in body | existing body plus `createSecret` → 201; wrong secret → generic 403 |
| `POST /api/lists/:slug/items` | `X-Create-Secret` header | `{ type, title, url?, priceMinor?, quantity? }` → item |
| `GET /api/lists/:slug` | guest session | items gain `type`, `url`, `priceMinor`, `availableUnits`; group gifts gain `pledgedMinor`; plus `payment { venmoHandle?, zelleHandle? }` |
| `POST /api/lists/:slug/items/:itemId/hold` | guest session | adds `name` (1–100, trimmed), `message?` (≤ 300) |
| `POST /api/lists/:slug/items/:itemId/contributions` | guest session | `{ idempotencyKey, amountMinor, name, message? }` → 201; replay with the same key → 200 with the original |

- Errors follow the existing domain-error mapping.
- Schemas live in `packages/shared-types`, flow into `openapi.json`, and
  `schema.gen.ts` is regenerated from it.
- pino redacts `createSecret`, `name` and `message`.

### Web

- `CreateListPage` gains a create-secret field.
- `ManagePage` (`/:slug/manage`):
  - It first prompts for the secret and keeps it in memory only, never in a URL
    or storage (ADR-0062's rule).
  - It has an add-item form with a single/group switch.
- `ListPage` shows single-column cards with title, price, store link and an
  image placeholder.
  - Singles show units left and **Hold it**.
  - Group gifts show a progress bar ("$X of $Y · N%") and **Chip in**.
- `HoldSheet` gains name and message fields.
- `ContributeFlow` is a native `<dialog>` (ADR-0024). It works in three steps:
  1. The guest chooses "Cover the rest" or a custom amount.
  2. The pay step shows a Venmo deep link
     (`venmo://paycharge?txn=pay&recipients=…&amount=…`, falling back to
     `https://venmo.com/…`) and/or the Zelle handle with **Copy**.
  3. "I've sent it" sends the editable amount, name and message.

  The idempotency key is generated when the flow opens. Status changes are
  announced via aria-live (ADR-0025).

### Deployment

- A multi-stage `Dockerfile` builds the web app and the API, then runs as a
  non-root user with `NODE_ENV=production` in the runtime stage only.
  `DATABASE_PATH` points at a volume.
- A compose file covers the home-server-plus-tunnel setup.
- The composition root validates the following and fails fast if any is
  invalid:
  - `CREATE_SECRET` is required.
  - `SESSION_COOKIE_SECRET` must be non-empty.
  - `VENMO_HANDLE` and `ZELLE_HANDLE` are optional, and their format is
    validated.

## Delivery

| Track | PRs | Depends on | Contents |
|---|---|---|---|
| 0. Deploy | 2 | — | Dockerfile, compose and CI container smoke job · `CREATE_SECRET` on create (config, constant-time check, form field) |
| 1. Items | 3 | — | Multi-item `Wishlist`, quantity availability, add-item use case and route · `url`, `priceMinor`, `Money`/`Currency` · `ManagePage`, guest cards, e2e |
| 2. Holder details | 2 | — | `GuestPii` + `piiRef` on holds · `HoldSheet` fields, e2e |
| 3. Group gifts | 4 | 1 (PR 1), 2 (PR 1) | `Item.type`, `Contribution`, `canAccept` · pledge use case and route, payment config · `ContributeFlow`, progress bar, e2e · owner group-gift option |

About 11 PRs. Tracks 0, 1 and 2 start together.

New ADRs: the always-required `CREATE_SECRET` (amends ADR-0014), owner =
operator for single-list instances (defers ADR-0015's owner-token flow), and
env-var payment handles (defers ADR-0044's per-list configuration).

## Testing

- Each rule gets one test, at the layer that owns it:
  - **Domain:** availability with quantity > 1, no holds on group gifts,
    `canAccept` bounds, and the pledged total.
  - **Use case:** pledge idempotent replay.
  - **Routes:** status codes and wiring, the wrong create secret, and the
    secret's transport (a header, never a query string).
- Port contract suites are extended for `contributions`.
- A structural test checks that no event payload type contains `name` or
  `message`.
- e2e (Playwright + axe, 375 px):
  1. The owner adds a single (qty 2) and a group gift.
  2. A guest holds, extends and purchases the single.
  3. A second guest pledges "Cover the rest" and the bar shows 100%.
  4. Replaying the pledge creates no second contribution.
- **CI container smoke test:**
  1. Build the container.
  2. Assert it exits non-zero without `CREATE_SECRET`.
  3. Start it with the secret and a temporary volume, and check that `/health`
     returns 200.
  4. Check that a create with a wrong secret is refused.
- **Manual go-live checklist:**
  1. Run the container behind the tunnel.
  2. Create the list from a phone over HTTPS.
  3. Go through the hold and pledge flows on a phone.
  4. Confirm the Venmo deep link opens the app.

## Known risks

- `CREATE_SECRET` doubles as the owner credential while `/manage` is open.
  Rotate it if it leaks.
- There's no hold cap, so one guest could hold everything. Fix that by hand in
  the DB if needed.
- Until the owner view exists, seeing pledges and names needs a DB query.
- There's no rate limiting and no backups. The guest key gate is the only
  protection.
