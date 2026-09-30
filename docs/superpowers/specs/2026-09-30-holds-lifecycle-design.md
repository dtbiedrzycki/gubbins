# Holds lifecycle — design (sub-project 2)

**Status:** Draft, brainstorming in progress. Sections 1–4 approved;
Section 5 presented, awaiting approval; Section 6 (testing and PR stack)
not yet presented. Not yet reviewed as a written spec.
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

## Decision log

Decisions made during brainstorming, in order. Later entries supersede
earlier ones where noted.

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Scope includes multi-item lists, guest PII, reminders + periodic task, and owner-side release. | The cross-item cap (ADR-0046) is meaningless with one item per list; PII, reminders and owner release complete the hold journey the spec describes. | Deferring each to its later sub-project. |
| D2 | Owner release ships with a **minimal spoiler model**: owner-token entry, `ownerSeesClaimStatus` / `ownerSeesClaimerIdentity` toggles, sticky `revealedAt`; `revealAfter` nullable until sub-project 4. | `ownerSeesClaimStatus` defaults off; a release control shown only on held items would leak claim status. | Spoiler-neutral blind release; API-only release with no UI. |
| D3 | Single items support **quantity ≥ 1**. | The availability rule has to be rewritten against hold rows anyway; closes the roadmap's quantity-1 open item. | Keep quantity = 1. |
| D4 | **Hold rows are the source of truth for liveness.** `item_state.active_holds` is dropped; `item_state` keeps `seq` and `purchased_count`. | Under lazy expiry nothing is written when a hold expires, so a counter cannot stay honest. The spec already names `holds` as the source for the per-session count and expiry display. | Counter with lazy compaction (two sources of truth); emitting `HoldExpired` on read (spec: derived, not emitted). |
| D5 | Hold state is **timestamps only**: nullable `releasedAt` / `purchasedAt` (at most one set) plus `expiresAt`; derived `statusAt(now)` → `active \| expired \| released \| purchased`. | "Active" is the spec's word (`MAX_ACTIVE_HOLDS_PER_SESSION`, `activeHolds`), so it names the derived state; no stored enum competes with it. Matches the spec's timestamp convention (`archivedAt`, `revealedAt`, `confirmedAt`). | Stored `resolution` enum; nullable `closedAs`. |
| D6 | **`actor` is event-envelope metadata**, supplied by the use case to `EventStore.append(itemId, expectedSeq, events, actor)`. Domain command methods take no caller; payloads carry no actor. | ADR-0075 says exactly this. | `actor` parameter on domain methods / in payloads (an early draft of this design). |
| D7 | **Authorization:** use cases call a domain policy, `HoldPermissions` (`mayExtend` / `mayRelease` / `mayPurchase`), over domain predicates. `AccessContext` is grown from the existing `SessionPayload`, built only in `presentation/`, and passed to use cases **beside** `TransactionContext`, never inside it. | DDD practice: authentication at the edge; rules a domain expert would state (spoiler gating, "only the holder may extend") live in the domain as a policy; entity methods stay free of caller parameters. `TransactionContext` is database-scoped, access is request-scoped. Also stops the raw session id crossing into `application/`. | `Accessor` parameter on entity methods; ambient AsyncLocalStorage; access inside `TransactionContext`. |
| D8 | Load **only active holds**: `HoldRepository.findActiveForWishlist(wishlistId, now)`; the domain re-checks each with `statusAt(now)`; paths that need an expired hold load it by id or public key; a port contract suite pins the boundary. | Expired-but-unclosed holds are never closed under lazy expiry, so "all unclosed" grows without bound. Chooses purity + performance over completeness (the domain-model trilemma) with a contract test as the guard rail. | Load all unclosed holds. |
| D9 | **Backend portability is a design principle**, not a requirement: ports speak domain terms only; each port has an adapter contract suite; DB `CHECK`s are backstops. SQLite-specific mechanics stay in `infrastructure/`. | Keeps the door open to another SQL server cheaply. NoSQL would need ADR-0009 (cross-record atomicity), ADR-0031 and ADR-0072 revisited — its own ADR if ever wanted. | Hard NoSQL requirement; SQL-family requirement with Postgres in CI. |
| D10 | **Hold credential: a client-generated Ed25519 seed.** The client generates a 32-byte seed at sheet open, derives the public key (`@noble/ed25519`, used unconditionally), and signs `gubbins-hold-v1\n{subjectId}\n{action}\n{timestamp}`. The server stores only the public key, verifies with `node:crypto`, and accepts timestamps within ±5 min (client corrects via the `Date` header). The seed never reaches the server. | Supersedes, in order: server-generated plaintext secret in a side table (for rebuild and replay); hash-only server secret (replay could not return it); client random secret (bearer, sent on every action). A portable credential is required for lost-session recovery, and a portable credential is necessarily a bearer credential; signing adds that the credential never crosses the network, so captured requests cannot be reused. No nonce store: every mutating action is single-use under the domain rules, so the timestamp window suffices. Hashing/securing hold secrets does **not** meaningfully protect against DB theft, since `owner_token` and the guest key are plaintext beside them (ADR-0052). | HMAC-derived secret (key loss silently breaks every link); P-256 (long links, no seed derivation in WebCrypto); dropping per-hold credentials (lost session = unmanageable hold). |
| D11 | **Hold link is a fragment:** `/{slug}/hold#k=<seed>`; the page strips it with `history.replaceState` after reading. | ADR-0067's reasoning: fragments never reach servers, proxies or logs; the SPA is served by the backend, so a path segment would. | Path-based `/{slug}/hold/{secret}` as the spec currently says. |
| D12 | **Cross-device session transfer is its own sub-project, 2b**, directly after 2. It should consider reusing D10's signing scheme and device-bound keys/passkeys, and a client-initiated email of the hold link. | Initiated from the old device, so it covers device switching, not session loss; separable from the hold lifecycle. | Inside sub-project 2; folded into 5. |
| D13 | **Reminder bookkeeping lives in a side table** `hold_reminders`, outside `rebuildProjections`; delivery is **at most once** (claim, commit, then send). The reminder email cannot contain the hold link (the server never has the seed). | A column written by the periodic task and not derived from events would be wiped by a rebuild, causing duplicate reminders. At-most-once matches the spec's framing that a failed run costs a missed reminder. | `holds.reminded_for_expires_at` column (an earlier draft). |
| D14 | **Migrations amend `0001_init` in place.** | Pre-1.0, no deployed instances: the ADR-0048 / ADR-0075 precedent. Avoids SQLite's table rebuild to drop `active_holds`. Dev databases must be recreated. | New `0002` migration. |
| D15 | An **expired** hold may still be marked purchased if the item has a free unit; otherwise a conflict. | A guest who bought the gift offline after expiry should not have to re-hold it. | Purchase only while active. |

## Design

### 1. Domain model and hold lifecycle (approved)

**`Hold`** — own aggregate, referenced by `itemId`, reached through the
`Wishlist`.
- Fields: `id`, `itemId`, `publicKey`, `sessionHash`, `idempotencyKey`,
  `piiRef`, `expiresAt`, `extended`, `releasedAt?`, `purchasedAt?`.
- `statusAt(now)`: `purchased` if `purchasedAt`; `released` if
  `releasedAt`; `expired` if `now > expiresAt`; else `active`. The one
  definition of hold state; never stored.
- `extend(now, duration)`: only `active` and not yet extended; adds
  `duration` to the **current** `expiresAt` (max exposure stays
  2 × duration, ADR-0002). Returns `HoldExtended`.
- `release(now)`: only `active`. Sets `releasedAt`. Returns `HoldReleased`.
- `markPurchased(now)`: sets `purchasedAt`, returns `ItemPurchased`.
  Called via `Wishlist.purchaseHold`, which allows an `expired` hold only
  when the item has a free unit (D15).
- Predicates: `belongsToSession(sessionHash)`,
  `publicKey.verifies(message, signature, verifier)`.

**`Item`** — `quantity ≥ 1`; `placeHold` enforces
`active + purchased < quantity` from hold state, never a counter;
`recordEvent()` returns the seq-before and advances `seq` for every hold
command on the item's stream.

**`Wishlist`** (aggregate root) — owns `items[]`, `ClaimVisibility`
(two toggles, sticky `revealedAt`, nullable `revealAfter`) and a snapshot
of the list's **active** holds (D8).
- `holdItem(...)`: `getItem` (authorization), counts this session's
  active holds across the list → `HoldCapReachedError` at the cap,
  delegates to `item.placeHold`, adds the new hold to the snapshot.
- `findHold(holdId)`, `purchaseHold(hold, now)`,
  `addItem({ title, quantity })` (single-item guard removed),
  `claimStatusVisibleToOwner(now)`, `claimerIdentityVisibleToOwner(now)`.

**`HoldPermissions`** (domain policy, D7):

| Command | Guest (session match or valid signature) | Owner |
|---|---|---|
| Extend | ✓ once | ✗ |
| Release | ✓ | ✓ only when `claimStatusVisibleToOwner(now)` |
| Mark purchased | ✓ | ✗ (deferred to 4) |

Guest credentials are evaluated before owner; the actor recorded is the
role of the credential that authorized the action (ADR-0075).

**Events** — all payloads carry `v: 1`; no PII (only `piiRef`); actor is
envelope metadata (D6). `ItemHeld { holdId, itemId, publicKey,
sessionHash, idempotencyKey, piiRef, expiresAt, occurredAt }`;
`HoldExtended { holdId, expiresAt }`; `HoldReleased { holdId }`;
`ItemPurchased { holdId }`. All appended to the item's stream.

### 2. Persistence and schema (approved)

Amend `0001_init` in place (D14).

```
wishlists   + owner_sees_claim_status int not null default 0
            + owner_sees_claimer_identity int not null default 0
            + revealed_at text null, reveal_after text null
            + CHECK (owner_sees_claimer_identity = 0 OR owner_sees_claim_status = 1)
items       + CHECK (quantity >= 1), index (wishlist_id)
item_state  - active_holds
            + purchased_count int not null default 0, CHECK (purchased_count >= 0)
holds       - secret
            + public_key text not null unique
            + pii_ref text not null references guest_pii(id)
            + extended int not null default 0
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
  `saveItemState(item)` writes `seq` and `purchased_count` as the domain
  left them, with no read-before-write (roadmap open item 2).
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
| `POST /api/owner/session` | `{ ownerToken }` | → sets `gubbins_owner` (httpOnly, signed, `sameSite: strict`, 30-day rolling), `{ slug }` |
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

### 5. Web UI (presented, awaiting approval)

| Route | Page | Contents |
|---|---|---|
| `/` | `CreateListPage` (extended) | "Already have a list? Paste your owner token" → `/{slug}/manage`; create gains optional first-item quantity |
| `/:slug` | `ListPage` (extended) | item cards (status badge, units left, **Hold it** ≥ 44 px); **Your holds** with expiry and actions |
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
  once extended; expired holds offer purchase only while a unit is free;
  release confirms; changes announced via aria-live (ADR-0025).
- `lib/holdCredential.ts` is the only importer of `@noble/ed25519`; the
  API client records the server clock offset from `Date` headers; the seed
  lives only in component memory (never storage, never logs).
- `schema.gen.ts` regenerated; MSW handlers updated.

### 6. Testing and PR stack (not yet presented)

## ADR and spec changes

1. New ADR: `Wishlist` is the aggregate root (roadmap open item 1).
2. New ADR: the hold credential is a client-held Ed25519 seed; the server
   stores only the public key; signed, timestamp-windowed actions. Amends
   ADR-0052's hold-secret clause; records that ADR-0035's constant-time
   rule does not apply to signature verification or public-key lookup;
   records the `@noble/ed25519` dependency.
3. Spec amendments: holds and guest-UX (fragment link, seed credential),
   data-and-persistence (`ItemHeld.publicKey`, `hold_reminders` and
   `guest_pii` outside rebuild), access-identity (hold credential no
   longer a stored bearer secret).
4. Roadmap: add sub-project 2b (session transfer) with D12's notes.
