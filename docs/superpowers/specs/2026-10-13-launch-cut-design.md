# Launch cut: one live registry — design

**Status:** Accepted
**Date:** 2026-10-13
**Target go-live:** ≈ 2026-10-27
**Roadmap:** [roadmap to full spec](../plans/2026-09-30-roadmap-to-full-spec.md)
**Amends:** the delivery order of the [holds lifecycle design](2026-09-30-holds-lifecycle-design.md)
and pulls a subset of sub-project 3 (group gifts) forward.

## Purpose

Run the owner's own registry live within about two weeks. Guests must be able
to do every item action and every group-gift action from their phones. The
owner only needs to create the list (with payment handles) and add items.

After holds stack A, main supports one list with exactly one item. It has no
owner access, no funds, no creation gate and no production container. Following
the planned order (holds stacks B–G, then sub-project 3) would miss the date.
This design cuts the launch down to what that registry needs and defers the
rest.

**Done when** the guest and owner journeys below run end to end (the owner and
pledge journeys at a 375 px viewport), the production container passes its CI smoke test, and the manual
go-live checklist passes on the home server.

## Decision log

| # | Decision | Why | Rejected |
|---|---|---|---|
| L1 | Creating a list **always requires `CREATE_SECRET`**; the app refuses to start when it is unset. | One operator, one list; a public site must not offer creation to strangers. Simpler than self-locking. | ADR-0014's self-lock after the first list; open creation. |
| L2 | **Owner access exchanges the owner token for a cookie.** `/{slug}/manage` posts `{ ownerToken }` once to `POST /api/lists/:slug/owner-session`. The route loads the list by slug, compares the token in constant time (ADR-0035), and sets the signed `gubbins_owner` cookie (`httpOnly`, `sameSite: strict`). Owner routes then check that cookie. | This is the app's existing secret pattern (the guest key is exchanged for `gubbins_session`) and the long-term owner design (ADR-0015, ADR-0062). The slug in the path makes the D17 hash lookup unnecessary, and `CreateList` already returns the token. | A `CREATE_SECRET` header on every call: a new pattern, with the secret held in JS memory. The token-only paste flow on `/` (needs D17): deferred. |
| L3 | **Payment handles are set at list creation:** `venmoHandle?` and `zelleHandle?` are stored on the wishlist as per-list configuration (ADR-0044's model, with only these two kinds). `Wishlist.addItem` refuses a group gift when the list has no payment method. | This keeps payment details with the list, and a guest can never reach a group gift with no way to pay. | Env vars (an earlier draft); a payment-settings UI, which is deferred, so handles can't be edited after creation. |
| L4 | **Group gifts only**: `Item.type` is `single \| group`. A group gift's price is its target. Open-ended funds are deferred. | The owner's registry needs priced items that guests chip in toward. | Funds with optional targets; both kinds. |
| L5 | A contribution is **pledged only**, created at "I've sent it" (ADR-0050). There's no owner confirm/void yet, so the progress bar shows pledged amounts. | Guests can complete the whole flow; the owner reconciles outside the app. | Owner confirmation at launch. |
| L6 | **Overfunding is allowed.** Only the 5× target bound and the arithmetic bound apply (ADR-0047, ADR-0061). | Simplest policy; the excess stays on the item (ADR-0011). | Blocking at target. |
| L7 | **USD only**, held in `Currency`/`Money` value objects. | One currency; the value object keeps the picker cheap to add later. | Currency picker at creation. |
| L8 | **Contribute flow is trimmed:** "Cover the rest" plus a custom amount. Venmo uses its https payment link, which opens the app where it's installed and the website otherwise. Zelle shows the handle with a copy button. There's no QR code, since most guests are on phones. | The design targets phones, but some guests will open the list on a computer or on a phone without the Venmo app. A `venmo://` deep link fails on both. | ¼/⅓/½ suggestions, payment QR codes. |
| L9 | Guests give a **name and optional message** on holds and pledges, stored in `GuestPii` via `piiRef` (holds stack D, ADR-0057). There's no owner view of them yet. | The owner needs to know who gave what for thank-yous; capturing it now costs little and the view can follow. | No PII until later. |
| L10 | The **production container** targets a home server behind a tunnel: multi-stage, non-root, `/health`, SQLite on a volume, secure cookies, required `SESSION_COOKIE_SECRET`. CI builds it and smoke-tests it. | The owner's chosen hosting. | VPS or PaaS-specific configuration. |
| L11 | **Process for this push:** one plan for every track, run as one linear stack, since the tracks share `routes.ts`, `0001_init.ts` and `openapi.json`. Each track's e2e test is folded into its web PR. PRs stay at 10 files or fewer, with TDD and tests at the owning layer. Spec amendments come after launch. | Fit the date without giving up reviewability. | Stack A's per-stack just-in-time plans (D20); larger PRs. |
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
- The token-only owner paste on `/` (D17), and editing payment handles (L3).
- Owner confirm/void/reconciliation, and the owner viewing holds, pledges and
  names.
- ¼/⅓/½ suggestions, the "already sent" hint (ADR-0050), and the sm/lg grid
  breakpoints (D16).
- Open-ended funds, the custom payment method, payment QR codes, a currency
  picker, and item editing or archiving.
- Rate limiting, backups, and the privacy/GDPR surface.

## Design

### Domain

- `Wishlist` gains `paymentMethods`: an optional Venmo handle and an optional Zelle handle (`venmoHandle`, `zelleHandle`), set by `CreateList`.
  Venmo handles are validated as usernames, and Zelle handles as an email or a
  US phone number.
- `Wishlist.addItem` loses the single-item guard and takes a type:
  - `single` takes `{ title, url?, priceMinor?, quantity ≥ 1 }`.
  - `group` takes `{ title, url?, priceMinor }`, where the price is the target
    and the quantity is fixed at 1. A list with no payment method refuses it
    with a domain error.
- Holds apply only to singles: `holdItem` on a group gift is a domain error.
- Availability for singles follows holds design §1: `active + purchased <
  quantity`.
- **`Contribution`** is its own aggregate, referenced by `itemId` and authorized
  through `Wishlist.pledge(...)`.
  - Fields: `id`, `itemId`, `amount: Money`, `idempotencyKey`, `sessionHash`,
    `piiRef`, `pledgedAt`. `sessionHash` is stored now so the "already sent"
    hint (ADR-0050) can be built later without backfilling.
  - It returns `ContributionPledged { contributionId, itemId, amountMinor,
    idempotencyKey, sessionHash, piiRef, occurredAt, v: 1 }`. This mirrors
    `ItemHeld`, which also carries `sessionHash`. The event carries
    no PII and is appended to the item's stream with actor `guest`.
- **`Item.pledge`** (ADR-0047/0061) refuses an amount that isn't a positive
  whole number of minor units, is above `priceMinor × MAX_CONTRIBUTION_TARGET_MULTIPLE`
  (a constant, 5), or is above `MAX_MONEY_MINOR`. Overfunding is otherwise
  allowed (L6).
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
               + venmo_handle text null, zelle_handle text null
guest_pii      NEW (holds design §2)
holds          + pii_ref references guest_pii(id)
contributions  NEW: id pk, item_id, amount_minor int CHECK (> 0), idempotency_key,
               session_hash, pii_ref, pledged_at; UNIQUE (item_id, idempotency_key)
```

- The store URL must be `https:` and is validated at the trust boundary. It's
  rendered with `rel="noopener noreferrer"`.
- `rebuildProjections` re-folds `contributions` from `event_log`;
  `guest_pii` is left untouched.

### API

| Route | Credential | Body → response |
|---|---|---|
| `POST /api/lists` | `createSecret` in body | existing body plus `createSecret`, `venmoHandle?`, `zelleHandle?` → 201 (includes `ownerToken`, as today); wrong secret → generic 403 |
| `POST /api/lists/:slug/owner-session` | `{ ownerToken }` in body | sets `gubbins_owner` → `{ ok: true }`; wrong token or unknown list → the same generic 404 |
| `POST /api/lists/:slug/items` | `gubbins_owner` cookie | `{ type, title, url?, priceMinor?, quantity? }` → item; group gift on a list with no payment method → 409 `no_payment_method` |
| `GET /api/lists/:slug` | guest session | items gain `type`, `url`, `priceMinor`, `availableUnits`; group gifts gain `pledgedMinor`; plus `payment { venmoHandle, zelleHandle }`, each nullable |
| `POST /api/lists/:slug/items/:itemId/hold` | guest session | adds `name` (1–100, trimmed), `message?` (≤ 300) |
| `POST /api/lists/:slug/items/:itemId/contributions` | guest session | `{ idempotencyKey, amountMinor, name, message? }` → 201; a replay with the same key returns the original, also 201 |

- Errors follow the existing domain-error mapping.
- Schemas live in `packages/shared-types`, flow into `openapi.json`, and
  `schema.gen.ts` is regenerated from it.
- Fastify's request logging is off, so request bodies (secrets, tokens, names,
  messages) are never logged. The error hook logs only the message, stack, URL
  and validation issues. pino and its redaction come with sub-project 6.

### Web

- `CreateListPage` gains a create-secret field and optional Venmo and Zelle
  handle fields.
  - The form says that group gifts need at least one handle and that handles
    can't be changed later.
  - The success screen tells the owner to save the owner token and links to
    `/:slug/manage`.
- `ManagePage` (`/:slug/manage`):
  - It first asks for the owner token and exchanges it for the cookie. The
    token is never put in a URL or storage (ADR-0062).
  - It has an add-item form with a single/group switch. A group gift on a
    list with no payment method shows the server's `no_payment_method`
    message.
- `ListPage` shows single-column cards with title, price, store link and an
  image placeholder.
  - Singles show units left and **Hold it**.
  - Group gifts show a progress bar ("$X of $Y · N%") and **Chip in**.
- `HoldSheet` gains name and message fields.
- `ContributeDialog` is a native `<dialog>` (ADR-0024). It works in three steps:
  1. The guest chooses "Cover the rest" or a custom amount.
  2. The pay step lists what the guest has to do: send the amount, come back,
     then add their name and choose "I've sent it". It shows Venmo's payment
     link (`https://venmo.com/<handle>?txn=pay&amount=…&note=…`, with the
     item's title as the note), on every device, when the list has a Venmo
     handle, and the Zelle handle, if there is one, with **Copy**.
  3. "I've sent it" sends the editable amount, name and message.

  The idempotency key is generated when the flow opens. Status changes are
  announced via aria-live (ADR-0025).

### Deployment

- A multi-stage `Dockerfile` builds the web app and the API, then runs as a
  non-root user with `NODE_ENV=production` in the runtime stage only.
  `DATABASE_PATH` points at a volume.
- A compose file covers the home-server-plus-tunnel setup.
- `server.ts` validates the following at startup (`secretsConfig.ts`) and
  fails fast if any is invalid:
  - `CREATE_SECRET` is required.
  - `SESSION_COOKIE_SECRET` must be non-empty in production; elsewhere it
    falls back to a development secret with a warning.

## Delivery

| Track | PRs | Depends on | Contents |
|---|---|---|---|
| 0. Deploy | 2 | — | Dockerfile, compose and CI container smoke job · `CREATE_SECRET` on create (config, constant-time check, form field) |
| 1. Items | 4 | — | Owner session (owner-token exchange, `gubbins_owner`, owner credential in `AccessContext`) · multi-item `Wishlist`, quantity availability, add-item use case and route · `url`, `priceMinor`, `Money`/`Currency` · `ManagePage`, guest cards, e2e |
| 2. Holder details | 2 | — | `GuestPii` + `piiRef` on holds · `HoldSheet` fields, e2e |
| 3. Group gifts | 4 | 1 (PR 2), 2 (PR 1) | `Item.type`, `Contribution`, `Item.pledge` bounds, payment methods on `Wishlist` · pledge use case and route, handles on create (API and form) · `ContributeDialog`, progress bar, e2e · owner group-gift option |

The plan's task order supersedes this table: one linear stack of small PRs, because the tracks share files.

New ADRs:
- The always-required `CREATE_SECRET` (amends ADR-0014).
- The owner session keyed by slug plus owner token (amends D17's hash lookup
  for this route).
- Payment handles set at creation and immutable for now. This narrows ADR-0044
  to two kinds and defers editing.

## Testing

- Each rule gets one test, at the layer that owns it:
  - **Domain:** availability with quantity > 1, no holds on group gifts, no
    group gift without a payment method, handle validation, `Item.pledge`
    bounds, and the pledged total.
  - **Use case:** pledge idempotent replay.
  - **Routes:** status codes and wiring, the wrong create secret, and the
    wrong owner token getting the same 404 as an unknown list. Secrets travel
    only in request bodies, never in a query string or path.
- Port contract suites are extended for `contributions`.
- A test for each event asserts that its payload has no `name` or `message`
  key.
- e2e (Playwright + axe), three specs:
  1. `owner-adds-items` (375 px): the owner creates a list with a Venmo handle,
     opens `/manage` with the owner token, and adds a single (qty 2) and a
     group gift.
  2. `guest-manages-a-hold`: a guest holds, extends and purchases the single.
  3. `guest-pledges` (375 px): a guest pledges "Cover the rest" and the bar
     shows 100%.
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
  4. On a phone with the Venmo app, confirm the Venmo link opens the app with
     the amount and note (the item's title) filled in.
  5. On a phone without the app, and on a computer signed in to Venmo, confirm
     the Venmo link opens the website's payment form with the amount and note
     filled in.

## Known risks

- The owner token is shown once at creation. If it's lost, recovery means
  reading it from the DB (ADR-0051). Accepted by the owner on 2026-10-13.
- Payment handles can't be edited after creation. A typo needs a DB fix until a
  settings UI exists. Accepted by the owner on 2026-10-13.
- There's no hold cap, so one guest could hold everything. Fix that by hand in
  the DB if needed.
- Until the owner view exists, seeing pledges and names needs a DB query.
- Venmo pays only through its https link, with no fallback. That it opens the
  app where installed and the filled-in website otherwise comes from a hand
  check, not Venmo's docs. Go-live steps 4–5 check it again.
- There's no rate limiting and no backups. The guest key gate is the only
  protection.
