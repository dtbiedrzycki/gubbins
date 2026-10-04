# Holds lifecycle — design (sub-project 2)

**Status:** Approved (written spec reviewed and approved 2026-10-01).
Stack A is planned in
[2026-10-01-holds-stack-a-guest-manages-a-hold.md](../plans/2026-10-01-holds-stack-a-guest-manages-a-hold.md);
later stacks are planned when they start (D20).
**Date:** 2026-09-30
**Roadmap:** [roadmap to full spec](../plans/2026-09-30-roadmap-to-full-spec.md), sub-project 2
**Governing ADRs:** 0002, 0008, 0009, 0012, 0035, 0046, 0048, 0052, 0057,
0062, 0063, 0067, 0075

## Purpose

Turn a hold from a one-way flag into a real lifecycle: holds expire after
`HOLD_DURATION_DAYS`, can be extended once, released, or marked purchased
(terminal); expiry is computed lazily; a guest session is capped at
`MAX_ACTIVE_HOLDS_PER_SESSION` active holds per list; double submits are
safe. Alongside that, the owner gets a recovery path (hold release) and
the pieces the hold flow needs to be real (multi-item lists, holder PII,
reminder email).

**Done when** the holds, guest-UX, domain-model and data-and-persistence
spec rules for single-item holds are enforced by the domain and covered by
tests, the guest and owner journeys run end to end, and `main` is green.

## Scope

**In:**
- Hold lifecycle: expiry, one extension, release (guest and owner), mark
  purchased, lazy expiry, per-session cap, idempotency.
- Multi-item lists: owner adds items (title, quantity ≥ 1).
- Guest PII on holds (`GuestPii` + `piiRef`, ADR-0057).
- Reminder email and the one periodic task (ADR-0063).
- Owner access (owner-token paste → owner cookie, ADR-0062), owner-side
  hold release, and a minimal spoiler model (claim-visibility toggles,
  sticky `revealedAt`).
- Roadmap carry-forwards: Wishlist aggregate-root ADR (open item 1); fix
  the `markHeld` port shape so the write path never decides availability
  (open item 2).
- Skeleton bug: the idempotency key is generated at submit time
  (`ItemView.handleConfirm`); the guest-UX spec requires sheet-open time.

**Deferred:**
- Owner "mark purchased directly" and `PurchaseVoided` → sub-project 4.
- `revealAfter` derivation (eventDate/timezone), list timezone rendering,
  showing the giver's message to the owner (ADR-0022) → sub-project 4.
- Redaction, privacy notice (ADR-0056), my-data link (ADR-0058) → 5.
- Owner-token and hold rate limiting → 6.
- Cross-device session transfer → new sub-project **2b** (D12).

## Reading this spec

Sections 1–5 describe the **end state** after all seven delivery stacks
(see Delivery). Each stack introduces only its own columns, payload
fields, routes and request fields, amending `0001_init` and event shapes
in place (D14). In particular: until stack E, holds keep the skeleton's
server-generated `secret` column and `HoldSecret` unchanged and the hold
request carries no `publicKey` / `signature`; until stack D there is no
`pii_ref` and no `name` / `message`; until stack G there is no `email`
field and `capabilities.reminders` is absent.

## Decision log

Decisions made during brainstorming, in order. Later entries supersede
earlier ones where noted.

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Scope includes multi-item lists, guest PII, reminders + periodic task, and owner-side release. | The cross-item cap (ADR-0046) is meaningless with one item per list; PII, reminders and owner release complete the hold journey the spec describes. | Deferring each to its later sub-project. |
| D2 | Owner release ships with a **minimal spoiler model**: owner-token entry, `ownerSeesClaimStatus` / `ownerSeesClaimerIdentity` toggles, sticky `revealedAt`; `revealAfter` nullable until sub-project 4. | `ownerSeesClaimStatus` defaults off; a release control shown only on held items would leak claim status. | Spoiler-neutral blind release; API-only release with no UI. |
| D3 | Single items support **quantity ≥ 1**. | The availability rule has to be rewritten against hold rows anyway; closes the roadmap's quantity-1 open item. | Keep quantity = 1. |
| D4 | **Hold rows are the source of truth for liveness.** `item_state.active_holds` is dropped; `item_state` keeps `seq` (and, as first written, `purchased_count` — superseded by D21). | Under lazy expiry nothing is written when a hold expires, so a counter cannot stay honest. The spec already names `holds` as the source for the per-session count and expiry display. | Counter with lazy compaction (two sources of truth); emitting `HoldExpired` on read (spec: derived, not emitted). |
| D5 | Hold state is **timestamps only**: nullable `releasedAt` / `purchasedAt` (at most one set) and `extendedAt` (set at most once), plus `expiresAt`; derived `statusAt(now)` → `active \| expired \| released \| purchased`. | "Active" is the spec's word (`MAX_ACTIVE_HOLDS_PER_SESSION`, `activeHolds`), so it names the derived state; no stored enum competes with it. Matches the spec's timestamp convention (`archivedAt`, `revealedAt`, `confirmedAt`). | Stored `resolution` enum; nullable `closedAs`. |
| D6 | **`actor` is event-envelope metadata**, supplied by the use case to `EventStore.append(itemId, expectedSeq, events, actor)`. Domain command methods take no caller; payloads carry no actor. | ADR-0075 says exactly this. | `actor` parameter on domain methods / in payloads (an early draft of this design). |
| D7 | **Authorization:** use cases call a domain policy, `HoldPermissions` (`mayExtend` / `mayRelease` / `mayPurchase`), over domain predicates. `AccessContext` is grown from the existing `SessionPayload`, built only in `presentation/`, and passed to use cases **beside** `TransactionContext`, never inside it. | DDD practice: authentication at the edge; rules a domain expert would state (spoiler gating, "only the holder may extend") live in the domain as a policy; entity methods stay free of caller parameters. `TransactionContext` is database-scoped, access is request-scoped. Also stops the raw session id crossing into `application/`. | `Accessor` parameter on entity methods; ambient AsyncLocalStorage; access inside `TransactionContext`. |
| D8 | Load **only active holds**: `HoldRepository.findActiveForWishlist(wishlistId, now)`; the domain re-checks each with `statusAt(now)`; paths that need an expired hold load it by id or public key; a port contract suite pins the boundary. | Expired-but-unclosed holds are never closed under lazy expiry, so "all unclosed" grows without bound. Chooses purity + performance over completeness (the domain-model trilemma) with a contract test as the guard rail. | Load all unclosed holds. |
| D9 | **Backend portability is a design principle**, not a requirement: ports speak domain terms only; each port has an adapter contract suite; DB `CHECK`s are backstops. SQLite-specific mechanics stay in `infrastructure/`. | Keeps the door open to another SQL server cheaply. NoSQL would need ADR-0009 (cross-record atomicity), ADR-0031 and ADR-0072 revisited — its own ADR if ever wanted. | Hard NoSQL requirement; SQL-family requirement with Postgres in CI. |
| D10 | **Hold credential: a client-generated Ed25519 seed.** The client generates a 32-byte seed at sheet open, derives the public key (`@noble/ed25519`, used unconditionally), and signs `gubbins-hold-v1\n{subjectId}\n{action}\n{timestamp}`. The server stores only the public key, verifies with `node:crypto`, and accepts timestamps within ±5 min (client corrects via the `Date` header). The seed never reaches the server. | Supersedes, in order: server-generated plaintext secret in a side table (for rebuild and replay); hash-only server secret (replay could not return it); client random secret (bearer, sent on every action). A portable credential is required for lost-session recovery, and a portable credential is necessarily a bearer credential; signing adds that the credential never crosses the network, so captured requests cannot be reused. No nonce store: every mutating action is single-use under the domain rules, so the timestamp window suffices. Hashing/securing hold secrets does **not** meaningfully protect against DB theft, since `owner_token` and the guest key are plaintext beside them (ADR-0052). | HMAC-derived secret (key loss silently breaks every link); P-256 (long links, no seed derivation in WebCrypto); dropping per-hold credentials (lost session = unmanageable hold). |
| D11 | **Hold link is a fragment:** `/{slug}/hold#k=<seed>`; the page strips it with `history.replaceState` after reading. | ADR-0067's reasoning: fragments never reach servers, proxies or logs; the SPA is served by the backend, so a path segment would. | Path-based `/{slug}/hold/{secret}` as the spec currently says. |
| D12 | **Cross-device session transfer is its own sub-project, 2b**, directly after 2. It should consider reusing D10's signing scheme and device-bound keys/passkeys, and a client-initiated email of the hold link. | Initiated from the old device, so it covers device switching, not session loss; separable from the hold lifecycle. | Inside sub-project 2; folded into 5. |
| D13 | **Reminder bookkeeping lives in a side table** `hold_reminders`, outside `rebuildProjections`; delivery is **at most once** (claim, commit, then send). The reminder email cannot contain the hold link (the server never has the seed). | A column written by the periodic task and not derived from events would be wiped by a rebuild, causing duplicate reminders. At-most-once matches the spec's framing that a failed run costs a missed reminder. | `holds.reminded_for_expires_at` column (an earlier draft). |
| D14 | **Migrations amend `0001_init` in place**, once per stack for that stack's columns; event payload shapes likewise. | Pre-1.0, no deployed instances: the ADR-0048 / ADR-0075 precedent. Avoids SQLite's table rebuild to drop `active_holds`. Dev databases must be recreated after each stack merges; each stack's PR description says so. | New `0002` migration. |
| D15 | An **expired** hold may still be marked purchased if the item has a free unit; otherwise a conflict. | A guest who bought the gift offline after expiry should not have to re-hold it. | Purchase only while active. |
| D16 | The guest list view shows item cards in a **responsive grid**: one column below `sm` (unchanged at the spec's 375 px mobile-first target), two from `sm`, three from `lg`; equal-height cards per row. | User direction; one column on phones keeps the guest-UX spec's mobile-first layout intact, so the spec amendment only adds the wider breakpoints. | Single column at every width (current spec wording). |
| D17 | **Owner-token lookup by hash:** `wishlists.owner_token_lookup = sha256(token)`, indexed; `POST /api/owner/session` looks up by that hash, then compares the plaintext with `timingSafeEqual`. The plaintext token stays (ADR-0052). | The paste flow carries no slug, so the list must be found from the token itself; an indexed lookup on the plaintext would violate ADR-0035's constant-time rule. Timing on the hash lookup can only reveal a SHA-256 digest. | Lookup on the plaintext token; requiring the slug alongside the token. |
| D18 | **Minimal `rebuildProjections` ships in this sub-project:** re-fold `item_state` and `holds` from `event_log`; `guest_pii` and `hold_reminders` untouched. | D10 and D13 are justified by rebuild-safety, and the testing spec requires a rebuild test; without the command those claims are untested. | Deferring rebuild to a later sub-project. |
| D19 | **Delivered as seven vertical-slice stacks (A–G)**, each shipping end-to-end functionality with its own e2e coverage and merging to `main` before dependants start. ADRs and spec amendments land in the stack that first needs them. | Smaller reviewable units; each stack is a working feature; findings in one stack can reshape the next stack's plan. | One 11-PR horizontal stack (schema → domain → … → web). |
| D20 | **Implementation plans are written just-in-time, one per stack**, each when its dependencies have merged. | Later plans reflect what was actually built. | All seven plans up front. |
| D21 | **An item's purchased count is computed from purchase entries, never stored.** In stack A a purchase entry is a hold with `purchased_at` set; owner direct purchases (sub-project 4) add their own entries, and `PurchaseVoided` voids an entry rather than decrementing. `item_state` keeps only `seq`. | A stored count is a second source of truth beside the rows it counts; computing it cannot drift (D4's reasoning, applied to purchases). PR #31 review. | `item_state.purchased_count` maintained by each purchase (D4 as first written). |
| D22 | **The `Wishlist` aggregate decides as of the instant it was loaded.** Its commands and status queries take no time argument. The use case reads the clock once and loads the aggregate at that instant, so load and decision share it, and no caller can decide on current data with an older date. `Hold`'s instant-taking methods are the aggregate's internals. | PR #32 review: a time parameter on domain commands is a leaky abstraction and invites time travel. | An injected `Clock` in the domain (separate reads drift from the load instant); explicit instant parameters (the earlier design). |

## Design

### 1. Domain model and hold lifecycle (approved)

**`Hold`** — own aggregate, referenced by `itemId`, reached through the
`Wishlist`.
- Fields: `id`, `itemId`, `publicKey`, `sessionHash`, `idempotencyKey`,
  `piiRef`, `expiresAt`, `extendedAt?`, `releasedAt?`, `purchasedAt?`.
- The methods below that take an instant are called only by `Wishlist`,
  with the instant it was loaded at (D22); application code goes through
  `Wishlist`.
- `statusAt(now)`: `purchased` if `purchasedAt`; `released` if
  `releasedAt`; `expired` if `now > expiresAt`; else `active`. The one
  definition of hold state; never stored.
- `extend(now, duration)`: only `active` and `extendedAt === null`; sets
  `extendedAt = now` and adds
  `duration` to the **current** `expiresAt` (max exposure stays
  2 × duration, ADR-0002). Returns `HoldExtended`.
- `release(now)`: only `active`. Sets `releasedAt`. Returns `HoldReleased`.
- `markPurchased(now)`: sets `purchasedAt`, returns `ItemPurchased`.
  Called via `Wishlist.purchaseHold`, which allows an `expired` hold only
  when the item has a free unit (D15).
- Predicates: `belongsToSession(sessionHash)`,
  `publicKey.verifies(message, signature, verifier)`.

**`Item`** — `quantity ≥ 1`; `placeHold` enforces
`active + purchased < quantity` from hold state, never a counter
(`Wishlist` supplies both counts);
`recordEvent()` returns the seq-before and advances `seq` for every hold
command on the item's stream.

**`Wishlist`** (aggregate root) — owns `items[]`, `ClaimVisibility`
(two toggles, sticky `revealedAt`, nullable `revealAfter`) and a snapshot
of the list's **active** holds (D8).
- `holdItem(...)`: `getItem` (authorization), counts this session's
  active holds across the list → `HoldCapReachedError` at the cap,
  delegates to `item.placeHold`, adds the new hold to the snapshot.
- Decides as of `asOf`, the instant it was loaded at (D22): no command or
  query below takes a time argument.
- `findHold(holdId)`, `holdStatus(hold)`, `canExtendHold(hold)`,
  `canReleaseHold(hold)`, `canPurchaseHold(hold)`, `itemStatus(itemId)`,
  `extendHold(hold, duration)`, `releaseHold(hold)`, `purchaseHold(hold)`,
  `addItem({ title, quantity })` (single-item guard removed),
  `claimStatusVisibleToOwner()`, `claimerIdentityVisibleToOwner()`.

**`HoldPermissions`** (domain policy, D7):

| Command | Guest (session match or valid signature) | Owner |
|---|---|---|
| Extend | ✓ once | ✗ |
| Release | ✓ | ✓ only when `claimStatusVisibleToOwner()` |
| Mark purchased | ✓ | ✗ (deferred to 4) |

Guest credentials are evaluated before owner; the actor recorded is the
role of the credential that authorized the action (ADR-0075).

**Events** — all payloads carry `v: 1` and `occurredAt`; no PII (only `piiRef`); actor is
envelope metadata (D6). `ItemHeld { holdId, itemId, publicKey,
sessionHash, idempotencyKey, piiRef, expiresAt, occurredAt }`;
`HoldExtended { holdId, expiresAt, occurredAt }`;
`HoldReleased { holdId, occurredAt }`; `ItemPurchased { holdId,
occurredAt }`. All appended to the item's stream. `occurredAt` is what a
rebuild folds into `extended_at`, `released_at` and `purchased_at`.

### 2. Persistence and schema (approved)

Amend `0001_init` in place (D14).

```
wishlists   + owner_token_lookup text not null unique   -- sha256(owner_token), D17
            + owner_sees_claim_status int not null default 0
            + owner_sees_claimer_identity int not null default 0
            + revealed_at text null, reveal_after text null
            + CHECK (owner_sees_claimer_identity = 0 OR owner_sees_claim_status = 1)
items       + CHECK (quantity >= 1), index (wishlist_id)
item_state  - active_holds
            - purchased_count never added: computed from purchase entries (D21)
holds       - secret
            + public_key text not null unique
            + pii_ref text not null references guest_pii(id)
            + extended_at text null
            + released_at text null, purchased_at text null
            + CHECK (released_at IS NULL OR purchased_at IS NULL)
            + index (item_id), index (session_hash)
            (UNIQUE (item_id, idempotency_key) already exists)
guest_pii   NEW, outside rebuildProjections (ADR-0057):
            id pk, name not null, email null, message null CHECK (length <= 300),
            redacted_at null, created_at
hold_reminders NEW, outside rebuildProjections (D13):
            hold_id pk references holds(id), reminded_for_expires_at not null
event_log   + actor text not null CHECK (actor IN ('guest','owner'))
```

**Ports** (domain terms only, D9):
- `WishlistRepository.findById` → aggregate with items and active holds;
  `saveItemState(item)` writes `seq` as the domain
  left them, with no read-before-write (roadmap open item 2); the purchased
  count is read from purchase entries when the aggregate loads (D21).
- `HoldRepository`: `insert`, `save`, `findById`, `findByPublicKey`,
  `findByIdempotencyKey`, `findActiveForWishlist(wishlistId, now)`.
- `GuestPiiRepository.insert` (on `TransactionContext`).
- `EventStore.append(itemId, expectedSeq, events, actor)`.
- Each port gets an adapter contract suite; expiry boundary fixtures
  (`expiresAt` = now − 1 ms / now / now + 1 ms, released, purchased) live
  there.

**Infrastructure notes:** `UnitOfWork` begins with `BEGIN IMMEDIATE`
(serialized writers make the ADR-0046 cap race-free on SQLite);
`expires_at` is always written with `toISOString()` so string comparison
is time order. Both are adapter details, commented where they occur.

### 3. API surface, `AccessContext` and the hold credential (approved)

**`AccessContext`** — type in `application/`, built only in
`presentation/accessContext.ts`. A set of verified credentials for the
wishlist: `guestSession { sessionHash }` (hashed in presentation),
`guestHoldSignature { timestamp, signature }`, `owner`.

**Hold credential** — see D10/D11. Canonical signed string
`gubbins-hold-v1\n{holdId|itemId}\n{action}\n{timestamp}`, action ∈
`hold | view | extend | release | purchase`. `HoldPublicKey` value object
verifies via a structurally typed verifier (`SignatureVerifierNode`
adapter). `HoldSecret` and `TokenGenerator.generateHoldSecret` are removed.

| Route | Credential | Body → response |
|---|---|---|
| `GET /api/lists/:slug` | guest session / owner | → `items[]` (`availableUnits`, status), `myHolds[]`, `capabilities { reminders, holdDurationDays }` |
| `POST /api/lists/:slug/items/:itemId/hold` | guest session | `{ idempotencyKey, publicKey, timestamp, signature, name, email?, message? }` → 201 hold view; replay with same key + same public key → 200 original; different public key → 409 `idempotency_conflict` |
| `POST /api/lists/:slug/hold-link` | signature | `{ publicKey, timestamp, signature }` → hold view |
| `POST /api/lists/:slug/holds/:holdId/{extend,release,purchase}` | guest session or `{ timestamp, signature }`; release also owner | → hold view |
| `POST /api/owner/session` | `{ ownerToken }` | → looks up by `sha256(token)` then constant-time compares (D17); sets `gubbins_owner` (httpOnly, signed, `sameSite: strict`, 30-day rolling), `{ slug }` |
| `GET /api/lists/:slug/owner` | owner | → items, settings; holds only when status visible; names only when identity visible |
| `POST /api/lists/:slug/items` | owner | `{ title, quantity }` → item |
| `PUT /api/lists/:slug/claim-visibility` | owner | `{ ownerSeesClaimStatus, ownerSeesClaimerIdentity }` → settings |

Errors: generic 404 for unknown list, bad/expired signature, not-yours,
or owner-can't-see-claims; 409 `{ code }` for `item_unavailable`,
`hold_cap_reached` (with `max`), `hold_not_active`,
`hold_already_extended`, `idempotency_conflict`. `ConcurrencyError`
retried 3× with jitter before 409. Schemas in `packages/shared-types`,
flowing into `openapi.json` (ADR-0077). `HOLD_DURATION_DAYS` and
`MAX_ACTIVE_HOLDS_PER_SESSION` validated at the composition root into a
`HoldPolicy` config. `pino` redacts `ownerToken`, `signature`, `name`,
`email`, `message`.

### 4. Guest PII, reminder email and the periodic task (approved)

- Hold sheet collects `name` (required, trimmed, 1–100 chars), `email`
  (optional, only when SMTP configured), `message` (≤ 300). One
  `guest_pii` row per hold, same unit of work. Structural test: no event
  payload type contains `name` / `email` / `message`.
- Names never shown to other guests (ADR-0042); owner sees `holderName`
  only when identity is visible. Until sub-project 5, the sheet shows one
  static line: "Your name is only shared with the list owner."
- `Mailer` port: `MailerSmtp` (nodemailer) / `MailerDisabled`, chosen from
  `SMTP_*`; `BASE_URL` required when SMTP is set (fail fast); warning when
  unset.
- Periodic task: in-process interval (default 15 min) started in
  `lifecycle.ts` after listen, stopped on shutdown, never overlapping,
  never crashing the process, emits no events.
  1. **Reminders:** holds not released/purchased, `expiresAt − 24h ≤ now
     < expiresAt`, email present, not yet reminded for this `expiresAt`.
     Claim → commit → send (at most once, D13). An extension re-arms the
     reminder. Suppressed entirely when `HOLD_DURATION_DAYS ≤ 1`.
  2. **Email purge:** `guest_pii.email = NULL` where
     `now > hold.expiresAt + 7 days`, whatever the hold's state.
- The email names the item and list, the expiry (UTC plus a relative
  phrase until sub-project 4), the list URL (not the key), and says to use
  the saved hold link or the original device. It cannot carry the hold
  link.

### 5. Web UI (approved)

| Route | Page | Contents |
|---|---|---|
| `/` | `CreateListPage` (extended) | "Already have a list? Paste your owner token" → `/{slug}/manage`; create gains optional first-item quantity |
| `/:slug` | `ListPage` (extended) | item cards in a responsive grid (D16: 1 / 2 / 3 columns at base / `sm` / `lg`) with status badge, units left, **Hold it** ≥ 44 px; **Your holds** with expiry and actions |
| `/:slug/hold` | `HoldLinkPage` (new) | reads `#k=`, strips it with `replaceState`, derives key, `POST /hold-link`, shows hold and actions; generic invalid-link message |
| `/:slug/manage` | `OwnerPage` (new) | add item; claim-visibility toggles; holds with **Release** when status visible, neutral line otherwise; release dialog names the holder only when identity visible |

- `HoldSheet` replaces `HoldDialog`: name / email (capability-gated) /
  message, "Held for you for N days", CTA "Confirm hold", never
  "reserve"; cannot close while pending.
- `useHoldCredential` generates `{ idempotencyKey, seed, publicKey }` once
  at sheet open (lazy state initializer) — fixes the skeleton's
  submit-time key.
- `HoldConfirmation`: **Mark as purchased** primary; hold link with
  **Copy link** and a one-line explanation; shown once.
- `HoldActions` shared by *Your holds* and `HoldLinkPage`: extend hidden
  once `extendedAt` is set; expired holds offer purchase only while a unit is free;
  release confirms; changes announced via aria-live (ADR-0025).
- `lib/holdCredential.ts` is the only importer of `@noble/ed25519`; the
  API client records the server clock offset from `Date` headers; the seed
  lives only in component memory (never storage, never logs).
- `schema.gen.ts` regenerated; MSW handlers updated.

### 6. Testing (approved)

TDD throughout; the domain layer carries the highest bar (testing spec).
Each group lands in the stack that introduces the behaviour (see
Delivery).

| Layer | Coverage | Stack |
|---|---|---|
| Domain unit | `statusAt` boundaries (now − 1 ms / now / now + 1 ms); extend once, added to current `expiresAt`; release/purchase transitions and errors; expired purchase with and without a free unit | A |
| | Availability with quantity > 1 | B |
| | Cap counts only active holds, across items, per session | C |
| | Signature verification: valid, wrong key / subject / action, timestamp at ±5 min edges | E |
| | `ClaimVisibility` (sticky `revealedAt`, identity requires status); full `HoldPermissions` matrix | F (guest rows in A) |
| Application (in-memory fakes) | Each use case; actor passed to `append` matches the authorizing credential; `ConcurrencyError` retried 3× | A onward |
| | Idempotent replay: same public key → original; different → `idempotency_conflict` | E |
| Port contract suites | One suite per port, run against both the in-memory fakes and the Kysely adapters (D9); expiry boundary fixtures | A, extended per stack |
| Integration (real SQLite) | Concurrency: N parallel holds on quantity-1 and quantity-k items → exactly 1 / k succeed | A (k in B) |
| | Parallel cap race never exceeds the cap | C |
| | Rebuild (D18): re-fold equals incremental state; `guest_pii` and `hold_reminders` untouched, every `piiRef` resolves | A (extended in D, G) |
| | ADR-0075 event-type/actor matrix; `CHECK` constraints reject invalid rows | A (owner release row in F) |
| | No event payload type contains `name` / `email` / `message` | D |
| Crypto compatibility | (seed, message, signature) fixtures from `@noble/ed25519` verified by `node:crypto`; RFC 8032 vectors | E |
| Security | IDOR: a hold id from list A on list B → 404 | A |
| | Owner-token transport (no query/path); timing on the owner-token path (D17) | B |
| | Output escaping of name and message | D |
| | Seed transport (e2e records every request, asserts the seed is in none); expired-window and replayed-extend signatures rejected | E |
| Periodic task | Due window; re-arm after extension; suppression at ≤ 1 day; at-most-once on send failure; 7-day purge; no overlap; a throwing run does not crash | G |
| Web unit | `useHoldCredential` generated once at open and stable across re-renders; sheet cannot close while pending; aria-live announcements | A (credential parts in E) |
| | `HoldLinkPage` strips the fragment | E |
| | Email field gated on `capabilities.reminders` | G |
| E2E (Playwright + axe, ADR-0026) | Guest same-device: key → hold → extend → mark purchased | A |
| | Owner: paste token → add item with quantity 2 → guest sees grid and units | B |
| | Guest cross-device: confirmation → open link in a fresh browser context → extend → purchase | E |
| | Owner: enable claim status → release a guest's hold | F |

Deferred to sub-project 6: the pre-v1 hold-cap validation simulation and
the full timing-side-channel suite across every credential.

## Delivery

Seven vertical-slice stacks (D19). Each ends with e2e coverage and merges
to `main` before its dependants start; each gets its own implementation
plan when it starts (D20). PR counts are estimates for the plans to
refine.

| Stack | Ships | PRs | Depends on |
|---|---|---|---|
| **A. Guest manages a hold** | Lazy expiry; extend once, release, mark purchased from *Your holds* via the session cookie; `HOLD_DURATION_DAYS` configurable; idempotency key generated at sheet open | 1. docs: this spec, Wishlist aggregate-root ADR · 2. schema amendment and event envelope (`actor`, `v`) · 3. domain lifecycle (`statusAt`, timestamps, guest `HoldPermissions`) · 4. persistence (active-hold loading, contract suites, `BEGIN IMMEDIATE`, concurrency, `rebuildProjections`) · 5. use cases, routes, web *Your holds*, e2e | — |
| **B. Owner adds items** | Owner-token paste (D17) → `/{slug}/manage`; add items with quantity; responsive item grid (D16) with units left | 1. owner session and owner credential in `AccessContext` · 2. multi-item `Wishlist`, quantity availability, add-item route · 3. web homepage paste, `OwnerPage` add item, grid, guest-UX spec amendment · 4. e2e | A |
| **C. Hold cap** | `MAX_ACTIVE_HOLDS_PER_SESSION` across items with the plain cap message | 1. domain, use case, race test · 2. web message, e2e | B |
| **D. Holder details** | Name and message → `GuestPii` via `piiRef`; no PII in events; log redaction | 1. `GuestPii`, `piiRef`, reworked `HoldItem` · 2. `HoldSheet` fields, e2e | A |
| **E. Hold link** | Ed25519 portable credential (D10, D11): confirmation with **Copy link**, `HoldLinkPage`, signed actions from another device | 1. hold-credential ADR and holds/guest-UX/access-identity amendments · 2. `HoldPublicKey`, verifier, compatibility fixtures · 3. hold-link and signed-command routes · 4. web `lib/holdCredential`, confirmation, `HoldLinkPage` · 5. e2e | A |
| **F. Owner release and spoilers** | Claim-visibility toggles, sticky `revealedAt`; owner sees holds (names when allowed) and releases them | 1. `ClaimVisibility`, owner `HoldPermissions` rows · 2. owner view, settings and release routes · 3. web toggles, holds list, release dialog, e2e | B, D |
| **G. Reminders** | Email field (SMTP only), `Mailer`, periodic task (at-most-once reminders, 7-day email purge) | 1. `Mailer` port, adapters, config · 2. periodic task and lifecycle · 3. capability flag, email field, tests | D |

Order: A → B → C; D and E may proceed in parallel after A; F after B and
D; G after D.

## ADR and spec changes

1. New ADR: `Wishlist` is the aggregate root (roadmap open item 1). Stack A.
2. New ADR (stack E): the hold credential is a client-held Ed25519 seed; the server
   stores only the public key; signed, timestamp-windowed actions. Amends
   ADR-0052's hold-secret clause; records that ADR-0035's constant-time
   rule does not apply to signature verification or public-key lookup;
   records the `@noble/ed25519` dependency.
3. Spec amendments, each in the stack that introduces the change: holds and guest-UX (fragment link, seed credential),
   guest-UX (responsive grid, D16), data-and-persistence (`ItemHeld.publicKey`, `hold_reminders` and
   `guest_pii` outside rebuild), access-identity (hold credential no
   longer a stored bearer secret).
4. Roadmap: add sub-project 2b (session transfer) with D12's notes.
