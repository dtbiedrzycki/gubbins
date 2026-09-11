# Self-Hosted Wishlist — Requirements & Architecture Spec

**Status:** Draft v0.10 — Clusters A–F resolved (instance setup & onboarding; owner dashboard & editing rules; guest UX & empty states; accessibility & browser support; ops, observability & performance; governance, docs & CI). A subsequent audience-fit review resolved three further items: payment methods generalized beyond US-only rails (ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)/[047](docs/adr/0047-contribution-snapshots-its-payment-method-at-pledge-time.md)), post-authentication guest write limits and double-submit protection (ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)–[050](docs/adr/0050-hold-contribution-submits-carry-a-client-generated.md)), and an explicit timezone model with timezone-stating display rules (ADR-[051](docs/adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md)/[052a](docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)). Cluster G (guest & owner access continuity) is resolved (ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)–[055](docs/adr/0055-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md), renumbered — see note below). Cluster H (lifecycle, teardown & operator obligations) is now also resolved (ADR-[056](docs/adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md)–[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)) — this round additionally reopened and superseded part of ADR-[034](docs/adr/0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md) (crypto-shredding deferral) once a real pre-purge erasure need materialized, and added a GDPR-aware erasure/self-service model that goes beyond documentation. Of the carried-forward product questions, anonymous contributions, AGPL self-hoster compliance, and offline non-monetary contributions (ADR-[061](docs/adr/0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)) are resolved. No open clusters or product questions remain in §[5](#5-open-questions).

A subsequent **consistency pass** over the whole document — a distinct workstream from the clusters, addressing latent contradictions rather than open questions — closed 29 findings and produced ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md)–[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md) (manual-contribution voidability; currency validation and the contribution-ceiling reframe; owner-token URL exclusion; the single periodic task and giver-email purge; `revealAfter` as a stored instant; erasure across backups and subject-access routing; client-IP resolution as a hop count; and the guest key moving to a URL fragment). The remaining findings amend existing ADRs or implement decisions already made. Each finding is listed with its resolving ADR or section in §[5](#5-open-questions), so no ADR in the 062–069 range is orphaned from the question trail. **The full ADR range is now 001–071, with 052a as the documented numbering quirk.** Two further ADRs (070, 071) record devcontainer/CI-only decisions outside the app clusters above — Claude Code `auto`-mode sandboxing and Claude Code/`gh` credentialing in the dev image — with no bearing on the production app's runtime.

Of the carried-forward flags, the hard block on payment-method-less group/fund creation is confirmed standing (a `custom` text-only method covers the offline-only owner without weakening it — §[3.14](#314-owner-dashboard--editing-rules)) and the hold-cap default now has a pre-v1 validation test attached (§[3.13](#313-testing)); both remain recorded in §[5](#5-open-questions) as decisions to revisit if the eventual test results warrant it, not as blockers. The contribution-ceiling half of that second flag is **closed** by ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md), which removed the money meaning from the absolute bound and so left no defensible-number question to validate.

**Note on ADR numbering:** ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md) was originally assigned to the timezone-reveal stickiness decision in the prior round. That decision is now indexed as **052a**, and the Cluster G decisions below take 052–055 — see §[4](#4-adr-index) for the definitive, non-overlapping list, which is authoritative if this summary and it ever disagree. (If reconciling against an earlier draft, note the timezone "sticky reveal" ADR is the one referenced from §[3.14](#314-owner-dashboard--editing-rules)/§[3.22](#322-time-timezones--display), and the Cluster G ADRs are the ones referenced from §[3.1](#31-access--identity)/§[3.14](#314-owner-dashboard--editing-rules)/§[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px).) Cluster H continues the sequence at ADR-[056](docs/adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md), with no further renumbering collisions.

**Purpose:** Single source of truth. Update this document after each decision chat; do not leave decisions living only in chat transcripts.

---

## 1. Overview

An open source, privacy-focused, self-hosted wishlist and registry service. A list owner publishes items; guests claim items or contribute money toward group gifts and open funds. Designed for weddings, baby showers, birthdays, and similar events.

### Design principles

1. **No accounts.** Access is by unguessable URL plus a shared key. Nobody registers to give or receive.
2. **No outbound requests at runtime** by default. No CDN, no analytics, no telemetry, no error reporting.
3. **The server is authoritative.** Business rules live server-side; clients ask rather than decide.
4. **YAGNI.** Complexity is added where it demonstrably pays (the ledger), not uniformly.
5. **Ten-minute setup.** A self-hosted project nobody can run is a project nobody uses.

### Non-goals

- No payment processing; the service never takes custody of funds
- No affiliate links
- No price tracking or monitoring (outbound-request privacy leak)
- No user accounts
- No social features, comments, or feeds
- No protection against a hostile server operator (they own the database)

---

## 2. Domain Model

```
Wishlist
  slug                    unguessable, in URL
  title                   required, ≤120 chars, escaped on output.
                          Identifies the list to guests after key entry,
                          on the owner dashboard, and in reminder email
                          subjects. Never rendered pre-authentication
                          (§[3.1](#31-access--identity)).
  description             optional free text, ≤2000 chars, escaped on
                          output. Owner-authored; the sanctioned place
                          for shipping details (§[3.7](#37-privacy)). Guest-visible
                          after key entry only.
  ownerToken               unguessable, grants full control, rotatable
  key                      guest key, stored in plaintext — consistent
                           with `ownerToken` and hold `secret`, neither
                           of which is hashed either. Human-readable and
                           speakable. See §[3.1](#31-access--identity), ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md).
  keyGen                  integer, starts at 1, incremented on every key
                          rotation. Carried in the guest session cookie
                          payload; a cookie bearing a stale keyGen is
                          rejected. This is the mechanism behind "key
                          rotation invalidates guest sessions" (§[3.1](#31-access--identity)).
  currency                ISO 4217 alpha-3 code, single per list; all
                          amounts inherit. Validated at write time;
                          immutable once any priced item exists. See
                          §[3.5](#35-payments), ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md).
  timezone                IANA identifier (e.g. Europe/London); governs
                          resolution of eventDate → revealAfter/purgeAt
                          instants. Defaults to the creating browser's
                          detected zone, editable in settings.
  eventDate               civil date (YYYY-MM-DD), not an instant
  revealAfter             stored instant. Set at creation from a
                          prefilled, editable field (default: end of
                          eventDate in `timezone`), entered as a local
                          date and time and resolved through `timezone`
                          at write. Editable in settings. A later
                          `eventDate` or `timezone` edit does not move
                          it — the instant is stored, not derived, and
                          the settings screen shows it resolved in the
                          current zone so a change in rendering is
                          visible rather than silent. See §[3.22](#322-time-timezones--display),
                          ADR-[066](docs/adr/0066-revealafter-is-stored-not-derived.md).
  revealedAt              nullable instant; set lazily in owner-request
                          middleware on the first authenticated owner
                          request where revealedAt IS NULL AND
                          now >= revealAfter — before routing, so a
                          settings edit in that same request cannot
                          outrun it. One-way, never cleared. No periodic
                          task is involved (ADR-[065](docs/adr/0065-one-periodic-task-with-giver-email-purge-attached.md)).
  ownerSeesClaimStatus    bool, default off
  ownerSeesClaimerIdentity bool, default off (gated behind status)
  allowOverfunding        block | warn | allow (default warn)
  paymentMethods          ordered list, 0..n; see PaymentMethod below.
                          Owner-configured, per-list.
  purgeAt                 derived instant; end of (eventDate +
                          PURGE_AFTER_DAYS) in `timezone`; must be
                          > revealAfter
  privacyNotice            optional owner-authored free text, ≤1000 chars,
                          escaped on output. Rendered to guests when set;
                          entirely omitted (no empty link, no placeholder)
                          when null. See §[3.7](#37-privacy), ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md).

Item
  type                    single | group | fund   (immutable after first claim)
  title, url, imageRef, notes, priority, category, sortOrder
  quantity                single only
  priceMinor              single, group
  targetMinor             group (= price), fund (optional)
  archivedAt              nullable timestamp; hides from guest view, retained
                           in reconciliation/thank-you/export. Set only via
                           ArchiveItem use case, not deletable once any event
                           exists on the item's stream.

  Hold           single only — expiresAt, secret, piiRef → GuestPii.id,
                 sessionHash, idempotencyKey
                 (holderName, email, message live in GuestPii, not here
                 — see §[3.8](#38-data--persistence), ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))
  Purchase       single only — terminal
  Contribution   group | fund — amount, piiRef → GuestPii.id,
                 method: { kind, label, handle } | null  ← snapshotted
                   at pledge time; null permitted only when
                   source = manual
                 contributorSessionHash (guest source only, null for
                   manual) — powers the same-session "you already sent
                   this" hint; not a recovery credential (§[3.1](#31-access--identity), ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md))
                 pledgedAt, confirmedAt?, source: guest | manual,
                 idempotencyKey
                 (contributorName, message live in GuestPii, not here
                 — see §[3.8](#38-data--persistence), ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))

PaymentMethod (value object, held per-Wishlist)
  kind                    known provider key (e.g. venmo, zelle) | custom
  label                   display name shown to guests ("Zelle",
                          "Bank transfer", "Revolut")
  handle                  destination: phone, email, @username, IBAN,
                          UPI ID, etc.
  instructions            optional free text, ≤200 chars, escaped on
                          output ("Please put your name in the reference")
  sortOrder

(new, outside ledger/projection scope)
ThankYouStatus
  contributionId | purchaseId | manualGiftEntryId
  thankedAt                nullable timestamp

(new, outside ledger/projection scope)
ManualGiftEntry
  id
  itemId                  nullable — advisory link to an existing list
                           item; null for a gift not tied to anything on
                           the list. Never affects `item_state` or guest-
                           facing availability (see invariants below).
                           Nulled (not blocked, not cascaded) if the
                           linked item is later hard-deleted.
  giverName                required, non-empty, trimmed, escaped on
                           output — same treatment as holderName/
                           contributorName (§[3.2](#32-names))
  description              required, ≤300 chars, escaped on output —
                           same cap as the giver→owner message field
                           (§[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px))
  recordedAt                timestamp, set at creation
  See §[3.14](#314-owner-dashboard--editing-rules), ADR-[061](docs/adr/0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md).

GuestPii (plain mutable table, outside event stream — same category as
          ThankYouStatus and the audit table: not derived from events,
          not folded, survives rebuildProjections untouched)
  id
  name                    nullable — null once redacted
  email                   nullable — hold-only, and never shown to the
                          owner; its sole consumer is the expiry reminder
                          (§[3.3](#33-holds-single-items)). Nulled by the periodic task once
                          now > the hold's expiresAt + 7 days, whether
                          the hold expired, was released, or was
                          purchased. See §[3.7](#37-privacy), ADR-[065](docs/adr/0065-one-periodic-task-with-giver-email-purge-attached.md).
  message                 nullable — optional giver→owner note
  redactedAt              nullable timestamp; set once, one-way — no
                           un-redact action exists
  createdAt
  See §[3.7](#37-privacy), §[3.8](#38-data--persistence), ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md).

GuestDataAccess (plain table, not event-sourced — same category as
                  GuestPii, ThankYouStatus, audit table)
  wishlistId               the list this secret is scoped to
  sessionHash              hash of the guest session cookie value — same
                           derivation as Hold.sessionHash /
                           Contribution.contributorSessionHash
  secret                   plaintext, unguessable, TokenGenerator-issued
                           — consistent with the plaintext-bearer-secret
                           model (ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md))
  createdAt
  UNIQUE (wishlistId, sessionHash)
  Created lazily on a session's first hold or contribution on a list.
  See §[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md).
```

### Invariants

- `activeHolds + purchased ≤ quantity` (single items)
- Contribution sum vs. `targetMinor` governed by `allowOverfunding`; overflow stays assigned to the same item
- Item type immutable once any hold or contribution exists
- Group items are quantity 1; their invariant is monetary, not count-based
- Every hold and contribution's `GuestPii` row carries a non-empty `name`
  **at creation**. A subsequent redaction (§[3.7](#37-privacy), ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)) is the one
  sanctioned way this can become null later — a deliberate state
  transition, not a violation of the creation-time requirement
- A `GuestDataAccess` row is created lazily on a session's **first** hold
  or contribution on a list, not at session start; every later hold or
  contribution from the same session reuses the existing row, so the
  secret is constant across everything one guest session does on one
  list (§[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md))
- A `GuestPii` row is referenced by exactly one hold or contribution,
  with one exception: a manual contribution corrected via void-and-
  re-record (§[3.6](#36-manual-contributions), ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md)) reuses its predecessor's `piiRef`, so a
  supersession chain shares one row. Sharing is legal **only** along
  such a chain — `GuestPii` rows are never deduplicated by name,
  session, or any other value, since redaction is scoped to the row and
  a row shared across unrelated records would let one erasure silently
  strip identity from a gift it was never meant to touch. See ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)
  for why the table is per-record rather than per-guest. *(ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md))*
- A `GuestPii` row's `name`/`message` may be edited in place only where
  the referencing contribution has `source = manual` and the row's
  `redactedAt IS NULL`. Guest-authored rows are redactable but never
  editable; a redacted row is neither. *(ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md))*
- A list must have at least one `PaymentMethod` before a `group` or `fund`
  item can be created; the last remaining method cannot be removed while
  any non-archived `group`/`fund` item exists
- Guest contributions carry a non-null method snapshot; manual
  contributions may carry null (offline cash, unknown rail)
- A guest session may hold at most `MAX_ACTIVE_HOLDS_PER_SESSION` items
  concurrently across the list. Purchased and released/expired holds do
  not count toward the cap
- Guest contribution amount must be > 0 and ≤ the sanity ceiling (§[3.4](#34-group-gifts--funds));
  this is independent of `allowOverfunding` and is not bypassed by `allow`
- `UNIQUE (itemId, idempotencyKey)` on holds and contributions; a
  duplicate submit returns the original result rather than creating a
  second record
- `timezone` must be a valid IANA identifier, validated against
  `Intl.supportedValuesOf('timeZone')` at write time; an offset string
  (`+05:30`) or abbreviation (`PST`) is rejected
- `currency` must be a valid ISO 4217 alpha-3 code, validated at write
  time against `Intl.supportedValuesOf('currency')`; a symbol (`$`), a
  name (`dollars`), or a non-ISO code (`BTC`, `XAU`) is rejected. Once
  any `Item` carrying a `priceMinor` or `targetMinor` exists, `currency`
  is immutable — changing it would silently reinterpret every stored
  amount (USD $50 becoming ¥50), and converting instead would require FX
  rates the no-outbound-requests principle rules out. Same reasoning as
  item-type immutability (ADR-[013](docs/adr/0013-item-type-immutable-after-first-claim.md)). *(ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- All amounts crossing into the domain are integer minor units. Major-unit
  parsing and formatting happen in presentation only, using the currency's
  exponent — the same boundary rule §[3.22](#322-time-timezones--display) applies to civil dates, and for
  the same reason: a representation that can be implied by omission gets
  implied wrongly. *(ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- `revealAfter < purgeAt`, compared as resolved instants, not civil dates
- Once `revealedAt` is set it is never cleared, and owner visibility never
  reverts, regardless of subsequent `timezone` or `eventDate` edits
- `PURGE_AFTER_DAYS` must be ≥ 1. At 0, `purgeAt` resolves to the same
  instant as the default `revealAfter`, violating `revealAfter < purgeAt`
  above.
- `title` and `description` are never rendered on any pre-authentication
  surface — the key gate, the generic not-found response (ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md),
  ADR-[056](docs/adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md)), or the instance homepage (§[3.1](#31-access--identity)). There is no separate owner
  or event name field; `title` is the only list-identifying string, so
  this single rule is what keeps the key gate silent.
  The same applies to `privacyNotice` (§[3.7](#37-privacy), ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md)), which by
  construction identifies the operator. A static, app-authored privacy
  statement — identical across all instances and slugs, carrying no
  owner-supplied content — is rendered pre-auth instead,
  unconditionally, so its presence signals nothing about whether a slug
  exists.
- A `ManualGiftEntry` requires a non-empty `giverName` and `description`
  at creation; no amount field exists on this entity by design — it
  records that a gift was given, not what it was worth
- A `ManualGiftEntry`'s `itemId` link is advisory only — it never affects
  `item_state` (activeHolds, purchasedCount, pledgedMinor, confirmedMinor)
  or guest-facing availability. An item received off-ledger is marked
  taken via the existing "mark as purchased directly" (single, §[3.3](#33-holds-single-items)) or
  a manual `Contribution` (group/fund, §[3.6](#36-manual-contributions)) — both of which are ledger
  events. Linking a `ManualGiftEntry` to an already-available item does
  not hide it from guests; the owner must also use one of those paths if
  that's the intent (the dashboard offers this as a single combined
  action for the single-item case — see §[3.14](#314-owner-dashboard--editing-rules))

---

## 3. Decided Requirements

### 3.1 Access & identity

- **Guest access** = slug (in URL) + key (entered once). Slug alone renders nothing.
- Key is human-readable and speakable (`warm-otter-42`), suitable for a printed invitation
- Key stored in plaintext, matching the existing treatment of `ownerToken`
  and hold `secret` — none of the system's bearer secrets are hashed.
  This is a deliberate change from the original design (which hashed only
  the guest key) made to support on-demand QR regeneration (§[3.14](#314-owner-dashboard--editing-rules),
  ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)); it removes an inconsistency rather than introducing a new
  one, and is consistent with §[3.7](#37-privacy)'s existing stance that DB-file/backup
  theft is an out-of-scope, deployment-level concern rather than
  something the app defends against internally. Brute-force guessing is
  stopped by rate limiting and unguessable `TokenGenerator` output
  (ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md), ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)), not by hashing.
- Successful entry sets a signed, httpOnly, list-scoped session cookie
- Rate limit key attempts per IP **and** per slug, with global lockout — see §[3.21](#321-threat-model) for concrete thresholds
- Key gate page reveals nothing — not the list `title`, not the
  description, no claim counts, nothing identifying the owner. `title` is
  the only list-identifying string in the model, so withholding it is the
  whole of the rule (§[2](#2-domain-model)).
  The gate does carry a static, app-authored privacy statement — what a
  Gubbins instance collects, that it is deleted after the event, and
  that the operator is the data controller. It contains no owner-supplied
  content and renders identically on every failed and successful gate, so
  it adds no per-slug signal (ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md), ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md)).
- **Owner access** = owner token alone; the key is not required, so key
  rotation cannot lock the owner out. The token is **never carried in a
  URL**. The owner pastes or types it into the homepage input already
  specified above, which smart-routes on it; the server validates and
  sets the signed, httpOnly, list-scoped, `Secure` owner-access cookie
  (ADR-[037](docs/adr/0037-session-and-owner-access-cookies-require-secure-https.md)), then routes to `/{slug}/manage`. There is no
  `?token=`-style link and no bookmarkable manage URL that carries the
  credential. *(ADR-[064](docs/adr/0064-the-owner-token-never-travels-in-a-url.md))*
- Key rotation invalidates guest sessions but preserves holds,
  purchases, and contributions. The mechanism is `keyGen` (§[2](#2-domain-model)): the
  counter is carried in the session cookie payload and incremented on
  rotation, so an existing cookie fails validation and the guest
  re-enters the new key. A re-entering guest receives a new session and
  therefore a new `sessionHash` and a new `GuestDataAccess` row — the
  same-session "you already sent this" hint (§[3.1](#31-access--identity), ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)) does not
  survive rotation. Previously issued `/{slug}/my-data/{secret}` links
  do: they resolve by secret to the pre-rotation row, so a guest's
  subject-access and erasure route is never revoked by an owner rotating
  the key.
- **Known limitation, accepted:** a guest who acts both before and after
  a rotation ends up holding two data-access links, each covering only
  the records from its own session, and neither showing everything. This
  reintroduces at two links the fragmentation ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md) rejected
  per-record secrets to avoid. It is not fixable: after rotation the
  system genuinely cannot tell the two sessions belong to one person —
  `sessionHash` is the only identity available and it has changed — and
  merging them would require a durable guest identity the no-accounts
  principle rules out (§[1](#1-overview), ADR-[001](docs/adr/0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)). Bounded by rotation being
  infrequent, and by each link remaining independently valid for the
  records it covers. *(ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md))*
- Owner token rotatable; rotation preserves all claim history
- Creation flow includes an explicit **"save your owner token"**
  acknowledgement screen, presenting the owner token, the guest key, and
  the list URL, with a "Copy" affordance on each. Named for the token
  rather than a link because the token is the credential and no
  full-control link exists to save (ADR-[064](docs/adr/0064-the-owner-token-never-travels-in-a-url.md)).
- The "save your owner token" screen also states plainly that the owner is
  responsible for any guest names, emails, or messages collected through
  the list, with a link to the privacy-notice guide (§[3.20](#320-governance-licensing--release-process)) —
  controller-awareness at the one moment every owner is guaranteed to
  pass through, rather than left to an optional field they may never
  fill in. *(ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md))*
- **No owner email is collected.** Automated owner-token recovery is
  deferred (ADR-[053](docs/adr/0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)), so there is nothing for an address to do; storing
  one against a future feature would be collection without a purpose,
  which §[3.7](#37-privacy) rules out for guests and should equally rule out for owners.
  Today, recovery for a list whose owner is not the operator requires the
  operator to act directly (rotating the token via container/DB access) —
  the same trust boundary the threat model already assumes for the
  operator (§[3.21](#321-threat-model)). If the deferred flow is later built, the field is
  added then, in settings.
- `X-Robots-Tag: noindex` and `robots.txt` on both guest and manage routes
- **Owner tokens are shared per list, not per-owner.** Co-owners (e.g., a couple) use the same token; there is no per-owner identity anywhere in the system, so N-tokens-per-list would add a token-management surface without any accountability benefit to attach it to. Compromise or a change in who should have access is handled by **rotation** (see above), not by issuing additional tokens. *(ADR-[015](docs/adr/0015-owner-tokens-are-shared-per-list-not-per-owner.md))*
- **List creation self-locks after the first list.** Creation is open with zero config until one list exists on the instance. After that, creation requires a valid invite secret (see §[3.11](#311-ops)) unless the instance explicitly opts into always-open creation. This gives the dominant solo/one-event deployment a frictionless zero-config path while preventing an internet-reachable instance (guests need unauthenticated access, so the instance is inherently public-facing) from accepting unlimited anonymous list creation. *(ADR-[014](docs/adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md))*
- **No public list directory.** The instance homepage never enumerates existing lists, and failed slug/key/token lookups return an identical generic "not found" response regardless of which part was wrong — an enumeration guard consistent with the unguessable-link model. *(ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md))*
- **Fresh-instance / unauthenticated homepage** shows: a one-line description of the instance, a single input that accepts a list link, an owner token, or a slug+key pair and smart-routes to the right place, and a "Create a list" affordance whose visibility follows the creation-gating rule above. If creation is currently locked, the page says so plainly rather than hiding the option ambiguously.
- **All secret comparisons use constant-time comparison.** This applies uniformly to owner token verification, hold-secret verification, guest key verification, and `CREATE_SECRET` — stated once as a blanket rule rather than per-mechanism, so no comparison path is inadvertently implemented with `===`. *(ADR-[036](docs/adr/0036-constant-time-comparison-generalized-to-all-secret.md))*
- **Session and owner-access cookies require the `Secure` attribute.** HTTPS (direct or via reverse proxy) is a stated deployment requirement, not an implied one, given the credentials-in-cookies access model. *(ADR-[037](docs/adr/0037-session-and-owner-access-cookies-require-secure-https.md))*

**Guest entry via link (ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md), transport superseded by ADR-[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md)):**

- Invitation links carry the guest key in the URL **fragment**:
  `/{slug}#key={key}`. The fragment is never transmitted to any server —
  not the app, not a local reverse proxy, not Cloudflare's edge. A small
  same-origin script reads `location.hash`, POSTs the key to the existing
  key-entry endpoint, and calls `history.replaceState` to clear it from
  the address bar.
- **This is the same endpoint manual entry already posts to**; the
  fragment path is simply a second caller. The key is transmitted once,
  in a POST body over TLS, and so appears in no access log, which records
  request lines rather than bodies.
- **Residual risk, unchanged and still disclosed:** the browser's history
  entry for the *originally tapped* link retains the fragment, since that
  is the URL the SMS or email opened. `replaceState` clears the address
  bar, not that entry. ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md) named this as unavoidable client-side and
  it remains so — this decision closes every server-side and intermediary
  leak and leaves exactly that one.
- **`pino` redact paths (§[3.19](#319-observability-logging-metrics-tracing)) must cover the POST body field**, not the
  query string. The guarantee is unchanged; its configuration moves.
- Key entry is a state-changing unauthenticated POST that sets a session
  cookie, so it requires `SameSite` on the resulting cookie and origin
  checking — a control the manual-entry form needed already, now stated.
- If the script does not run, the guest lands on the manual key-entry
  page and types the key. Degraded, not broken, and the fallback already
  exists for printed invitations.
- Manual key entry remains available at `/{slug}` for guests without a
  clickable link. Input field: autocomplete off, autocapitalize off,
  autocorrect off, spellcheck off, paste allowed, numeric keyboard not
  forced.
- Failed attempts return the same generic message, per ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md) and
  ADR-[056](docs/adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md), unchanged by this transport change.
- Guest session cookie lifetime: `purgeAt`. No independent cap — the
  cookie is scoped to one list which is deleted at that point, so it
  cannot usefully outlive the data it grants access to, and an earlier
  expiry falls hardest on guests least able to recover (a guest who no
  longer has the invitation cannot re-enter a key they never kept).
  Key rotation is the revocation mechanism (above), not expiry. This is
  deliberately unlike the owner-access cookie's 30-day rolling window
  (ADR-[064](docs/adr/0064-the-owner-token-never-travels-in-a-url.md)): the owner saved a token and re-entry costs one paste.
- Owner-access cookie lifetime: 30 days **rolling** (refreshed on each
  authenticated request) or `purgeAt`, whichever is sooner. Rolling
  rather than absolute so an owner who checks in periodically never
  re-enters, and only genuine month-long absence prompts it. Shorter
  than the guest session deliberately: the owner has saved one token and
  re-entry costs one paste, whereas re-keying a whole guest list does
  not. *(ADR-[064](docs/adr/0064-the-owner-token-never-travels-in-a-url.md))*
- The owner-access cookie also grants guest-view access to its own list,
  so an owner can preview what guests see without holding the guest key
  — consistent with "the key is not required" above.

**Same-session contribution hint (ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)).** A contribution stores the
hash of the guest session that created it (same pattern as `sessionHash`
on holds, §[3.3](#33-holds-single-items)). If that same session later revisits the item, the UI
shows a non-authoritative "you already sent $X here" hint. This is a
same-device/same-session convenience only — it does not survive a session
expiring or a device switch, and no dedicated recovery secret or link is
issued for contributions (see §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px), ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)).

**Guest self-service data access (ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)).** A guest can view and erase
everything they've personally shared on a list — all holds and
contributions tied to their session, joined through `piiRef` to
`GuestPii` — without going through the owner. Two entry points:

- **Live session**: `/{slug}/my-data`, using the existing session cookie,
  no secret in the URL. Same-device, same-session, no extra step.
- **Durable link**: `/{slug}/my-data/{secret}`, resolving via
  `GuestDataAccess.sessionHash` — covers a lost session or a different
  device. Shown once, with a "Copy link" affordance, on both the hold
  confirmation screen (§[3.3](#33-holds-single-items), §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px)) and the contribution confirmation
  screen (§[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px)), the same treatment already given to the hold-secret
  link.

The page lists every hold/contribution matching the session, with the
attached `GuestPii` (name/email/message) and what it's attached to
(item, amount, date). One primary action, **"Delete my personal
information"** — a single bulk call into the same redaction mechanism
ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) built for the owner side, invoked by the guest instead of the
owner. The label is deliberately scoped to identity, not the records
themselves: amount/item/status/date on the ledger remain and are
unaffected by this action, only name/email/message are stripped — the
UI should not imply the hold or contribution itself disappears when only
the personal-information fields are being redacted.

This is a narrow, differently-justified reopening of ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)'s rejection
of a contribution-side secret: ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md) rejected a secret for *pledge
recovery* (nothing left to recover once amount entry moved to "I've sent
it"); this secret grants access to `GuestPii` data that already exists
once a contribution is confirmed — a subject-access/erasure right, not a
recovery convenience, and unrelated to how the contribution flow is
shaped.

### 3.2 Names

- `holderName` / `contributorName` required, trimmed, non-empty,
  length-capped — stored as `GuestPii.name` (§[2](#2-domain-model), ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)), not directly
  on the Hold/Contribution row
- No anonymous path, no per-list toggle
- No uniqueness check — duplicate names are normal
- Escaped on output
- "Required" means *recorded*, not *always visible*; spoiler settings govern when the owner sees them
- Names are recorded but **never shown to other guests** — only the owner
  sees giver/holder identity, still gated by the existing spoiler toggles
  (`ownerSeesClaimStatus`, `ownerSeesClaimerIdentity`, `revealAfter`).
  This is a hard rule, not a per-list toggle: there is no configuration
  path for an owner to expose giver names to other guests (e.g. a
  pre-event "wall of thanks"). Confirmed as the resolution to the
  anonymous-contributions open question — a name is always required (for
  thank-you tracking and reconciliation, §[3.14](#314-owner-dashboard--editing-rules), §[3.6](#36-manual-contributions)), but "required"
  means recorded for the owner, never means visible to the guest
  community. *(ADR-[044](docs/adr/0044-anonymous-contributions-resolved-name-required-owner-only.md))*

### 3.3 Holds (single items)

- **Duration `HOLD_DURATION_DAYS`, default 3** (§[3.11](#311-ops)).
- Language is "hold" / "I'm buying this now" — never "reserve"
- Hold confirmation screen leads with **Mark as purchased** as primary action
- Private hold link `/{slug}/hold/{holdSecret}` to confirm, extend, or release; cookie as secondary
- The hold confirmation screen additionally surfaces the guest
  self-service data link (`/{slug}/my-data/{secret}`, §[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md))
  alongside the hold-secret link — shown once, same "Copy link" treatment
- **One self-service extension**, adding a further `HOLD_DURATION_DAYS`.
  The extension is not separately configurable — a second knob adds
  config surface with no evidenced need. Maximum exposure for a single
  item is therefore `2 × HOLD_DURATION_DAYS`.
- Reminder email 24h **before `expiresAt`** if email provided and SMTP
  configured — an offset from expiry, not from hold start, so it stays
  correct at any `HOLD_DURATION_DAYS`. Suppressed entirely where the
  configured duration is short enough that the reminder would fire at or
  before hold creation.
- The reminder is sent by the app's **one periodic task**, an in-process
  interval (default 15 min) — not an external cron, consistent with the
  single-container posture (§[3.11](#311-ops)). The task has exactly two duties:
  sending due reminders, and nulling `GuestPii.email` where
  `now > expiresAt + 7 days` (§[3.7](#37-privacy), ADR-[065](docs/adr/0065-one-periodic-task-with-giver-email-purge-attached.md)). Both are idempotent and
  neither affects correctness of any read: a failed or skipped run costs
  a missed reminder and delayed email purge, never a stuck item. Any
  further periodic work requires an ADR — the count of scheduled jobs is
  deliberately fixed at one.
- Expiry is **lazily computed** (`now > expiresAt`), never emitted by a job — a failed cron costs a missed email, not a stuck item
- Purchase is terminal; only the owner can undo it
- Owner can mark an item purchased directly (offline purchase)
- **Concurrent-hold cap per guest session**: a session may hold at most
  `MAX_ACTIVE_HOLDS_PER_SESSION` items at once (default 10 — set well
  above realistic honest use; a generous relative claiming several items
  should never meet it). Marking a hold purchased frees the slot, as does
  release or expiry, so a guest buying many items is never blocked. On
  hitting the cap the guest sees a plain, non-generic message ("You're
  holding the maximum of 10 items — mark one as purchased or release one
  to hold another"); ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md)'s generic-failure rule governs *pre-auth*
  lookups and does not apply here, where the guest is already keyed in.
  *(ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md))*
- `sessionHash` stores a **hash** of the session cookie value, never the
  value itself — a raw session identifier at rest is session-hijack
  material, and §[3.7](#37-privacy) places stolen-DB-file mitigation outside the
  application's scope, so the application should avoid writing
  credential-equivalent values there in the first place. Purged with the
  list like all other list data.
- **Owner-side hold release**: the owner dashboard can release any active
  hold, emitting the existing `HoldReleased` event. Needed as the recovery
  path when the cap is set generously and a guest still hoards, and as
  general cleanup for abandoned holds. Subject to the same spoiler gating
  as other claim-status-revealing controls (§[3.14](#314-owner-dashboard--editing-rules)).

### 3.4 Group gifts & funds

- Contributions go **to the owner**, who buys the item. No peer-to-peer money movement, no designated buyer.
- Group gift = a fund with a target and item metadata attached
- No holds on group or fund items
- **Overfunding** governed by `allowOverfunding`; excess stays on the same item, rendered as e.g. "$520 of $450 · 116%"
- Suggested amounts computed from the remainder — ¼, ⅓, ½, and **"cover the rest"**
- Underfunding at the event date breaks nothing; owner UI states it plainly without implying refunds
- **Contribution amounts are bounded two ways, for two different reasons.**
  The **money bound** is `targetMinor × MAX_CONTRIBUTION_TARGET_MULTIPLE`
  (default 5), applying where the item has a target. It is currency-neutral
  by construction, since it derives from a number the owner entered in their
  own currency. The **arithmetic bound** is `MAX_CONTRIBUTION_MINOR`, a fixed
  constant (10^12 minor units) that exists solely to keep sums inside safe
  integer range — it is not a statement about how much money is reasonable,
  and is set far above any honest gift in any currency. Both are input
  validation, **not** overfunding policy: `allowOverfunding: allow` bypasses
  neither. *(ADR-[049](docs/adr/0049-contribution-amounts-bounded-by-absolute-and-target.md), amended by ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- **Fat-finger protection is a client-side confirmation, not a hard block.**
  Where an amount is disproportionate to the target or to the list's other
  amounts, the contribute flow asks the guest to confirm before submitting.
  A pledge moves no money and is reversible by the owner in one click
  (§[3.6](#36-manual-contributions)), so prevention at the point of entry is the proportionate control;
  a configured server-side money threshold was tried and removed as
  answering an unanswerable question — "how much money is too much" has no
  currency-independent answer. *(ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- Manual contributions (§[3.6](#36-manual-contributions)) warn rather than block above the ceiling —
  the owner is the authoritative party and may legitimately be recording
  an unusually large offline gift.
- Policy check lives in the domain: `canAccept(amount, now, policy)`, which
  enforces the sanity ceiling alongside the overfunding policy

### 3.5 Payments

- Payment rails are **unverifiable programmatically** — the app never calls
  a payment API, never holds funds, and never confirms receipt. The owner
  reconciles manually. UI must be honest about this. *(ADR-[004](docs/adr/0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md))*
- Because nothing is verified, a "payment method" is display data, not an
  integration: a label, a destination handle, and a render strategy. It is
  therefore **per-list configuration, not a hardcoded enum**. *(ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md))*
- Two states: `pledged` (guest asserts) and `confirmed` (owner reconciled)
- Progress bar renders confirmed as solid, pledged as hatched/ghosted, with numbers stated plainly
- Guests see combined progress; owner sees the split plus a reconciliation view
- Amounts stored as integer minor units *(ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*

**Provider definitions.** Each `kind` maps to a definition shipped with the
app declaring: default label, handle placeholder/validation, and one of
three render strategies:

| Strategy | Behaviour | Examples |
|---|---|---|
| `deep_link` | App-scheme deep link with an https web fallback | Venmo (`venmo://paycharge?...`), PayPal.me, Cash App |
| `qr` | Locally generated QR from a documented payload spec | Zelle, UPI (`upi://pay`), SEPA (EPC069-12), PIX (BR Code) |
| `text` | Copyable handle plus instructions, no link | Bank transfer, IBAN, cash |

- **v1 ships `venmo`, `zelle`, and `custom` only.** Additional provider
  definitions are data files, community-contributable — the same delivery
  path chosen for locale files in ADR-[029](docs/adr/0029-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md). The model is built now; the
  catalogue is not.
- **QR codes are always generated locally** — never via a third-party API.
- **`custom` is `text` (and `text`-derived QR) only.** It never produces a
  deep link. Owner-supplied strings are never rendered into an `href`;
  deep links exist solely for known `kind` values whose templates ship
  with the app, and rendered URLs are restricted to `https:` plus the
  known app schemes those templates declare. *(ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md), §[3.21](#321-threat-model))*
- Payment method is **snapshotted onto the Contribution at pledge time**,
  a deliberate exception to the live-read rule in ADR-[018](docs/adr/0018-group-fund-targetminor-is-editable-and-read-live.md). *(ADR-[047](docs/adr/0047-contribution-snapshots-its-payment-method-at-pledge-time.md))*

### 3.6 Manual contributions

- `source: 'guest' | 'manual'` on Contribution
- Manual entries are `confirmed` at creation and bypass the overfunding policy
- Owner supplies the name
- **Manual entries are voidable, not editable, at the ledger level**, and
  are never hard-deleted — `ContributionVoided` is the deletion path, per
  §[3.8](#38-data--persistence)'s blanket soft-delete rule and the same reasoning ADR-[017](docs/adr/0017-items-with-ledger-history-are-archived-not-deleted.md) applied
  to items. Amount and the method snapshot live in the event payload and
  cannot be changed in place; correcting either is a void plus a fresh
  `ManualContributionRecorded`, surfaced to the owner as a single action
  (§[3.14](#314-owner-dashboard--editing-rules)). `source`, `pledgedAt`, and `confirmedAt` are immutable.
- **Name and message correct in place**, as a plain `UPDATE` on the
  entry's `GuestPii` row (§[2](#2-domain-model), ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)) with no ledger event — those
  fields were moved out of the event stream precisely so they could be
  mutated. Permitted only where the referencing contribution has
  `source = manual` (the owner is correcting their own record, not
  rewriting a guest's) and the row's `redactedAt IS NULL` (editing a
  redacted row would be an un-redact, which ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) forbids).
- Guest entries may be confirmed or voided but **not rewritten**; their
  `GuestPii` row is redactable but never editable. *(ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md))*
- Method is optional on manual entries: the owner may select a configured
  `PaymentMethod`, or leave it null (offline cash, or a rail the list never
  advertised). Null renders as "—" in the reconciliation view rather than
  being hidden.
- Source displayed in the reconciliation view

### 3.7 Privacy

- Zero outbound requests at runtime by default; self-hosted fonts
- Strict CSP, no inline scripts
- URL metadata scraping **opt-in and SSRF-guarded**: block private IP ranges, block redirects into them, timeouts. Note that fetching reveals the server IP to the retailer.
- Images: prefer owner upload; if fetched, cache locally, strip EXIF, resize. **Never hotlink** (leaks guest IPs).
- **No shipping address collected** (decided). Owner may place it in the list description.
- Giver emails are stored only until 7 days past the hold's `expiresAt`,
  then nulled by the periodic task (§[3.3](#33-holds-single-items)). The grace is fixed rather than
  configurable: the email's only consumer is the reminder, which fires
  before expiry, so afterwards it has no use and there is no operator
  judgement to make. This cannot be lazily computed the way hold expiry
  is — nothing reads a stale email, so nothing would trigger the
  evaluation, and a list nobody revisits after the event would otherwise
  hold addresses until `purgeAt`. Whole-list purge remains the backstop,
  so a failing task delays deletion rather than preventing it. No quiet
  mailing list. *(ADR-[065](docs/adr/0065-one-periodic-task-with-giver-email-purge-attached.md))*
- Auto-purge `PURGE_AFTER_DAYS` after the event date (default 90, §[3.11](#311-ops)).
  The window is deliberately generous rather than minimal: the thank-you
  view (§[3.14](#314-owner-dashboard--editing-rules)) is a post-event tool and a short window would delete the
  owner's thank-you list while they were still working through it.
- Guest names and emails never appear in logs
- Creation-gating invite secrets are configuration, not stored PII: no email collection or verification flow is used to gate list creation (see ADR-[014](docs/adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md))
- **Crypto-shredding: still deferred.** The existing whole-list `DELETE`
  at `purgeAt` already satisfies the stated privacy goal for data still
  live at that point (PII does not persist past the event) — this is a
  plain delete, not per-subject encryption. Full crypto-shredding
  (per-subject encryption keys, destroyed on erasure) remains rejected as
  complexity ahead of demonstrated need (YAGNI, see ADR-[021](docs/adr/0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md)). **The
  pre-purge single-guest erasure need this bullet originally flagged as
  hypothetical has since materialized** (a GDPR-facing self-hosted app
  realistically receives erasure requests before an event's `purgeAt`) —
  see the redaction model below, which supersedes this entry's originally
  sketched compensating-event fix without reopening the crypto-shredding
  deferral itself. *(ADR-[034](docs/adr/0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md), superseded in part by ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))*
- **Operator as GDPR data controller.** The operator determines why guest
  names, emails, and messages are collected and what happens to them —
  squarely the controller role under GDPR for any EU-guest list, with
  this project itself neither controller nor processor (there is no
  hosted service in the loop). An optional `privacyNotice` field (§[2](#2-domain-model)) lets
  the owner author their own notice (who's hosting this, how to contact
  them, that data is deleted after the event), rendered to guests when
  set. The app does not auto-generate or infer this text — it doesn't
  know the operator's identity, jurisdiction, or preferred contact
  method, and a confident-looking but incomplete auto-generated notice
  would be worse than an honest gap. A docs template (§[3.20](#320-governance-licensing--release-process)) gives
  operators a starting point to paste in and edit. The creation
  acknowledgement screen (§[3.1](#31-access--identity)) also states the controller obligation
  plainly at the one moment every owner passes through, so awareness
  doesn't depend on the optional field being filled in. *(ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md))*
- **Right to erasure, honored via redaction, not deletion.** The owner can
  redact an individual hold's or contribution's `GuestPii` row from the
  reconciliation or thank-you view — nulling `name`/`email`/`message` in
  place while the row itself (and its `id`) persists, so the event that
  references it via `piiRef` always resolves to a real row rather than a
  dangling reference. A guest can do the same for all of their own
  records at once via self-service data access (§[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)). Available
  regardless of `revealedAt` or the spoiler toggles — an erasure right
  isn't gated behind the owner's reveal preference. One-way: `redactedAt`
  is set once and there is no un-redact action, matching the `revealedAt`
  sticky pattern (§[3.14](#314-owner-dashboard--editing-rules), ADR-[052a](docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)) for the same reason — a reversible
  "erasure" invites confusion about whether data was actually removed.
  The amount, item, status, and date on the ledger entry are untouched;
  only identity is stripped, since none of the rest is personal data and
  none of it needs to disappear for the owner's own reconciliation to
  keep working. *(ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))*
- **Subject-access requests from guests are served by self-service
  (§[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)), not by JSON export.** A guest asking "what do you
  have on me" gets `/{slug}/my-data`, which shows that guest their own
  holds, contributions, and `GuestPii` and nothing else. The JSON export
  is a whole-list dump: handing it to a requesting guest would disclose
  every other guest's name, email, and message — a breach committed in
  the belief it was compliance. Export remains the right tool for
  *owner-side* portability (moving a list between instances) and for
  logical backup. Docs (§[3.20](#320-governance-licensing--release-process)) must state this split plainly, since the
  distinction is easy to miss under pressure from a real request.
  *(ADR-[067](docs/adr/0067-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Erasure is immediate in the live database and time-bounded in
  backups.** Restoring a snapshot taken before a redaction reintroduces
  the data, and no application mechanism prevents that. The remaining
  obligation is procedural and follows established practice: redact in
  the live database at once; hold any pre-redaction backup *beyond use*
  — not restored or accessed for any purpose — until it rotates out;
  re-apply the redaction if a restore does happen; and let the backup
  retention window (§[3.18](#318-backup-restore--upgrade-safety)) bound how long that lasts. The
  privacy-notice template (§[3.20](#320-governance-licensing--release-process)) states the window, since a guest
  exercising erasure has to be told when backup copies of their data
  will be gone. *(ADR-[067](docs/adr/0067-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Data-at-rest theft (stolen SQLite file or stolen backup) is a distinct
  actor from the operator themselves**, and is explicitly out of the
  application's scope to mitigate — encryption-at-rest is a deployment/OS-
  level concern (e.g. an encrypted volume, LUKS), not an app-level one.
  Named explicitly in the threat model (§[3.21](#321-threat-model)) so operators understand this
  is their responsibility rather than silently assumed away. This also
  covers the guest key, owner token, and hold secrets, all of which are
  stored in plaintext (§[3.1](#31-access--identity), ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)) — the same operator-trust boundary
  already applies uniformly to all of the system's bearer secrets.

### 3.8 Data & persistence

- **Event stream for the ledger only** — claims, purchases, contributions. Not for CRUD metadata.
- Event types: `ItemHeld`, `HoldExtended`, `HoldReleased`, `ItemPurchased`, `PurchaseVoided`, `ContributionPledged`, `ContributionConfirmed`, `ContributionVoided`, `ManualContributionRecorded`
- `ContributionVoided` applies to guest and manual contributions alike —
  voiding carries identical semantics regardless of `source`, which the
  projection reads from the original row, so no separate
  `ManualContributionVoided` type exists. (The *creation* events differ
  for real reasons — confirmed-at-creation, overfunding-policy bypass,
  nullable method, no `contributorSessionHash` — none of which apply to
  a void.) A voided contribution is subtracted from `pledgedMinor` /
  `confirmedMinor` in `item_state` and rendered as voided rather than
  hidden in the reconciliation view. *(ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md))*
- `HoldExpired` is **derived, not emitted**
- Event payloads carry a version field `v` from day one
- **Streams are scoped per item**, matching the consistency boundary
- `UNIQUE (itemId, seq)` provides optimistic concurrency; losing writer retries against fresh state and re-evaluates the policy. Retry cap 3 with jitter.
- Global auto-increment `id` gives cross-stream ordering for list-level views
- **Soft delete = a `Voided` event**, not a nullable column
- **Projections are real tables**, written in the same transaction as the append — synchronous and strongly consistent, not eventually consistent
  - `item_state` (lastSeq, activeHolds, purchasedCount, pledgedMinor, confirmedMinor)
  - `holds` (per-hold rows, for expiry display, the reminder job, the
    per-session concurrent-hold count, and the idempotency constraint)
  - `contributions` (per-row ledger for reconciliation, and the
    idempotency constraint)
- `rebuildProjections` command: truncate and re-fold. Events are the source of truth. **`thank_you_status` is explicitly outside this scope** — it is owner bookkeeping, not derived from events, and must survive a rebuild untouched. **`guest_pii` is likewise outside this scope**, for the same reason — plain bookkeeping, not folded from events. **`manual_gift_entries` is likewise outside this scope** — same category again: owner-authored, no ledger event, nothing to fold.
- **`ItemHeld`, `ContributionPledged`, and `ManualContributionRecorded`
  payloads carry `piiRef` (a `GuestPii` row id) rather than embedding
  `holderName`/`contributorName`/email/message directly.** This keeps
  personal data out of the append-only event log entirely, rather than
  relying on a compensating event to hide it later — a compensating event
  nulls the *projection*, not the source-of-truth payload, which would
  leave plaintext PII permanently recoverable from the event stream
  regardless of redaction. Per ADR-[033](docs/adr/0033-migrations-are-forward-only-rollback-restore-from-backup.md), this is a payload shape change;
  consistent with the precedent set in ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)/[047](docs/adr/0047-contribution-snapshots-its-payment-method-at-pledge-time.md)/[050](docs/adr/0050-hold-contribution-submits-carry-a-client-generated.md), the project is
  pre-1.0 with no deployed instances, so the shape is amended in place
  rather than versioned/upcasted. *(ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md), amends ADR-[034](docs/adr/0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md))*
- **Idempotency is enforced via `UNIQUE (itemId, idempotencyKey)` on the
  `holds` and `contributions` projections**, written in the same
  transaction as the event append (per the synchronous-projection rule
  above). No separate idempotency table and no new lazy-expiry mechanism
  is introduced. The key is carried in the `ItemHeld`,
  `ContributionPledged`, and `ManualContributionRecorded` payloads so a
  `rebuildProjections` run reconstructs the constraint rather than
  dropping it. *(ADR-[050](docs/adr/0050-hold-contribution-submits-carry-a-client-generated.md))*
- **Audit table for CRUD metadata**: `(entityId, field, oldValue, newValue, changedAt)`. Purge is a `DELETE`.
- SQLite in WAL mode, single file on a mounted volume
- **Rate limiting is also stored in SQLite** — a `rate_limit_attempts` table, fixed-window, lazily expired the same way hold expiry is (never a cron sweep). No new service dependency introduced for this. See §[3.21](#321-threat-model) for thresholds.
- DB-level check constraints as a backstop to application invariants

### 3.9 Backend architecture

**Clean Architecture**, four layers:

```
domain/          Entities, value objects, domain errors. Zero imports.
application/     Use cases + port interfaces. Depends only on domain.
infrastructure/  SQLite repos, event store, metadata fetcher, QR, SMTP, crypto.
presentation/    HTTP routes, zod schemas, DTO mappers, DI wiring.
```

Key ports:

- **`Clock`** — injected `now`; never call `Date.now()` below presentation. Makes the hold lifecycle deterministically testable.
- **`TokenGenerator`** — slugs, owner tokens, hold secrets, creation invite secrets, **and guest-data-access secrets** (§[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)). Faked in tests.
- **`UnitOfWork`** — `execute(fn)` wrapping a SQLite transaction.
- **`EventStore`** — `append(itemId, expectedSeq, events)`, throws `ConcurrencyError`.
- **`UrlMetadataFetcher`** — SSRF-guarded, entirely in infrastructure.

Guardrails:

- Domain entities are plain classes — no ORM decorators, no query-builder types
- ESLint `no-restricted-imports` banning `infrastructure/*` from `domain/*` and `application/*`, enforced in CI
- Use cases return domain errors as values or typed exceptions; only presentation maps to HTTP status
- Kysely or Drizzle over a full ORM — repositories own the SQL
- Separate use cases per claim family (`HoldItem`, `ContributeToItem`), not one polymorphic `ClaimItem`
- **Cross-item invariants read projections inside the transaction.** The
  concurrent-hold cap (ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)) is the first invariant in the system that
  spans items rather than living within one item's stream. Per-item event
  streams (ADR-[008](docs/adr/0008-event-streams-scoped-per-item-not-per-list.md)) are the consistency boundary, so this rule sits
  deliberately outside it: `HoldItem` counts the session's active holds
  from the list-wide `holds` projection and appends `ItemHeld` to the
  target item's stream **within a single `UnitOfWork`**. This is correct
  only because SQLite is single-writer and `BEGIN IMMEDIATE` serializes
  the read-then-append against concurrent writers — the count cannot go
  stale between the check and the append. Moving that read outside the
  transaction, or caching it, silently reintroduces a TOCTOU race that
  lets a session exceed the cap; treat it as load-bearing rather than an
  incidental implementation detail. The same constraint applies to any
  future cross-item rule.

### 3.10 Front-end architecture

**Does not mirror Clean Architecture.** Domain logic is server-side; duplicating rules client-side guarantees drift.

- **One API boundary**: all HTTP in `src/api/`, typed. Nothing else calls `fetch`.
- **Feature folders**, not type folders: `src/features/holds/`, `src/features/contributions/`
- **TanStack Query for server state** — caching, refetch, optimistic updates. Not `useState` + `useEffect`.
- **Shared types package** generated from zod schemas, so backend renames break the front-end build
- Dumb components; logic in hooks (`useHoldItem()`). Hooks are the testability seam.
- Pure display helpers (currency, percentage) may be shared. Policy logic may not.

### 3.11 Ops

- Single container, SQLite on a mounted volume — no separate DB service in the default path
- Migrations run on boot; refuse to start on failure rather than serving a half-migrated schema
- **Migrations are forward-only.** No down-migrations are shipped or maintained.
  Rollback story is "restore from the pre-upgrade backup" (§[3.18](#318-backup-restore--upgrade-safety)), not "run
  a down migration." The app additionally refuses to start if the DB's
  recorded schema version is *newer* than the running app expects, to guard
  against a botched downgrade attempt. *(ADR-[033](docs/adr/0033-migrations-are-forward-only-rollback-restore-from-backup.md))*
- All config via env vars; secrets via `_FILE` convention
- Non-root user, multi-arch (amd64 + arm64), healthcheck endpoint
- Reverse-proxy friendly: subpath deployment, trusted proxy headers
- **Proxy misconfiguration is detected and warned about, not silently
  tolerated.** If `TRUSTED_PROXY_HOPS` is 0 and an inbound request
  carries `X-Forwarded-For`, the app logs a warning stating that per-IP
  rate limiting has degraded to a single instance-wide bucket, and names
  the variable to set. If the count exceeds the entries actually present,
  it logs that the value is too high and falls back to the leftmost
  available entry rather than trusting a client-supplied one. Neither is
  fatal — the signal is a request header, so it cannot be checked at
  boot, and a running instance with degraded limits serves an event
  better than one that refuses to start during it.
- **On first request after start, the resolved client address is logged
  once at info level** alongside the raw header and the configured hop
  count. An operator checks their logs and sees either a real client
  address or `127.0.0.1` — ten seconds to verify, against discovering it
  mid-event when everyone is locked out. This matters because the hop
  count is a claim about topology that a single overwriting proxy
  (nginx's `$remote_addr` rather than `$proxy_add_x_forwarded_for`) can
  silently invalidate. A log line rather than a header-echoing endpoint,
  which would be both an information leak and something to abuse.
  *(ADR-[068](docs/adr/0068-client-ip-resolution-is-a-hop-count.md))*
- SMTP optional and off by default. **SMTP is a capability flag** — when unconfigured, the UI must not offer or imply reminders. Creation-gating does **not** depend on SMTP (see ADR-[014](docs/adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md)); email delivery reliability is not on the critical path for onboarding.
- JSON export/import for full data portability (logical backup); physical
  backup via `VACUUM INTO` (see §[3.18](#318-backup-restore--upgrade-safety))
- Structured logs to stdout via `pino`; `/health`; optional `/metrics` and
  tracing (see §[3.19](#319-observability-logging-metrics-tracing)). No outbound anything by default.

**Env var reference:**

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP listen port | `3000` |
| `BASE_URL` | Absolute URL base for links in emails | — (required if SMTP set) |
| `DATABASE_PATH` | SQLite file location | `./data/wishlist.db` |
| `CREATE_SECRET` | One or more comma-separated invite secrets; presenting any valid value authorizes list creation once the instance has self-locked | unset |
| `ALLOW_OPEN_CREATION` | Bypass the self-lock; creation always open, no secret required | `false` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Hold-expiry reminder email | unset → reminders disabled, warning logged |
| `TRUSTED_PROXY_HOPS` | Number of reverse proxies in front of the app. `0` = none, read the socket address. `1` or more = read the address the outermost trusted proxy appended to `X-Forwarded-For`, counting from the right, so a client-supplied header value cannot be mistaken for the real one. The quickstart's Tunnel-plus-local-proxy path is `2`. Must be set correctly or per-IP rate limiting (§[3.21](#321-threat-model)) is either evadable (too high) or collapses into a single global bucket (too low) | `0` |
| `DEFAULT_TIMEZONE` | IANA fallback when browser detection is unavailable at list creation | `UTC` |
| `MAX_ACTIVE_HOLDS_PER_SESSION` | Concurrent active holds one guest session may have across a list | `10` |
| `MAX_CONTRIBUTION_TARGET_MULTIPLE` | Ceiling as a multiple of `targetMinor`, where a target exists | `5` |
| `HOLD_DURATION_DAYS` | Initial hold length; the single self-service extension adds the same again | `3` |
| `PURGE_AFTER_DAYS` | Days after `eventDate` before the whole list is deleted. Minimum 1. Applies to existing lists on change, since `purgeAt` is derived — treat as set-once for an instance serving live lists | `90` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `NODE_ENV` | Runtime mode | `production` |
| `METRICS_ENABLED` | Expose `/metrics` (Prometheus text format via OpenTelemetry exporter); pull-based, scraped by the operator's own tooling — does not violate the no-outbound-requests principle since nothing leaves the box unprompted | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Operator-supplied collector for trace export; unset = spans stay in-process only, never leave the container | unset |
| `SOURCE_URL` | AGPL-3.0 compliance: link surfaced in the footer/about page pointing to the source of the code actually running. Defaults to the upstream repo; **operators who modify the code are responsible for updating this** to their own fork before serving guests, per AGPL §13's network-use clause | upstream repo URL |

Notes on `CREATE_SECRET`:
- Each comma-separated value is an independent, symmetric capability token — not a per-identity credential. There is no email, verification flow, or identity storage involved (rejected as inconsistent with the no-accounts principle; see ADR-[014](docs/adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md) rationale).
- Revoke one invitee by removing their value and restarting the container; other values are unaffected.
- Values should be high-entropy random strings generated the same way as guest keys and owner tokens (via `TokenGenerator`), not admin-chosen passphrases. A `generate-invite-secret` CLI helper is provided for this.
- Incoming values are checked with constant-time comparison, not `===` (generalized in ADR-[036](docs/adr/0036-constant-time-comparison-generalized-to-all-secret.md) to apply to all secret comparisons, not just this one).

### 3.12 Development environment

- **Dev Containers spec** (`.devcontainer/devcontainer.json`) — consumed by VS Code, Cursor, Windsurf, JetBrains Gateway, Codespaces, and the `devcontainer` CLI
- `docker-compose.yml` shared between devcontainer and app container
  - One `app` service for normal development; no service the app functionally depends on — SQLite is embedded, so a database container is deliberately absent. The one exception is infrastructure rather than an app dependency: an `egress-proxy` sidecar, present only when running Claude Code in `auto` mode (see below)
  - Base image pinned to a specific Node LTS minor version, not a floating tag, so `npm ci` resolves identically for every contributor
  - Container runs as the invoking host UID/GID to avoid bind-mount permission drift on Linux hosts
- **Local override mechanism**, so checked-in files stay canonical and personal changes never land in a commit by accident:
  - `docker-compose.override.yml`, gitignored, for per-developer compose changes
  - `.env.example` committed; `.env` gitignored, layering per-developer values on top of the §[3.11](#311-ops) defaults
- `postCreateCommand` for `npm ci`
- **Named volume for `node_modules`** — bind-mounting is the classic macOS performance trap
- SQLite data file bind-mounted (not a named volume) in dev, so a developer can inspect or delete `wishlist.db` directly
- `customizations.vscode.extensions` for ESLint/Prettier/Vitest, and `customizations.vscode.settings` for format-on-save; namespaced so other IDEs ignore gracefully
- Dev image separate from the minimal, non-root production image
- **Claude Code sandboxing for `auto`-mode runs** *(ADR-[070](docs/adr/0070-devcontainer-sandboxes-claude-code-auto-mode-via-an-egress.md))*: `app` sits
  on an `internal: true` Docker network with no direct route out; a
  single-purpose `egress-proxy` sidecar — the only container with
  external network reach — enforces a domain/SNI-based allowlist (npm
  registry, GitHub, the Anthropic API; deliberately excluding this
  project's own Codeberg remote). Neither container needs
  `NET_ADMIN`/`NET_RAW`, and the allowlist needs no maintenance as DNS or
  CDN IPs rotate, since enforcement never depends on a resolved IP. Not
  used for `default`/`acceptEdits`/`plan` sessions, where a human
  confirms every command already. `bypassPermissions` is out of scope
  entirely and not enabled anywhere in this setup.
- **Claude Code and `gh` in the `app` image** *(ADR-[071](docs/adr/0071-claude-code-and-gh-ship-in-the-app-image-with-no-baked-in.md))*: both installed
  by default in `Dockerfile.dev`. Credentials for neither are ever baked
  into the image. Claude Code auth is a one-time interactive `claude
  login`, deliberately not persisted — its OAuth state lives in the
  container's writable layer and is lost on rebuild, requiring
  re-authentication afterward, by design rather than oversight. `gh`
  auth is a fine-grained, repo-scoped personal access token supplied via
  the existing gitignored `.env`, matching the per-developer-secret
  convention already used elsewhere in this section. Both are set up
  under the plain `docker-compose.yml`, before `docker-compose.sandbox.yml`'s
  egress-proxy layer is ever in the picture.

### 3.13 Testing

- Unit tests with coverage reporting; high bar on the domain layer
- Integration tests against real SQLite, not mocks
- **Explicit concurrency test**: N parallel holds on a quantity-1 item; N parallel "cover the rest" clicks
- Projection rebuild test: fold events, compare to incrementally
  maintained state; verify all three non-derived tables survive a
  rebuild untouched — `thank_you_status`, `guest_pii`, and
  `manual_gift_entries` (§[3.8](#38-data--persistence)) — including that a redacted `GuestPii`
  row remains redacted and every `piiRef` still resolves afterwards. The
  two added here are where a mistake costs most: a rebuild that clears
  `guest_pii` orphans every `piiRef` in the event log, and one that
  clears `manual_gift_entries` loses owner-authored records with no
  ledger events to reconstruct them from.
- Playwright e2e for the guest flow, with `@axe-core/playwright` wired in (see §[3.16](#316-accessibility--browser-support))
- Security tests as first-class cases:
  - SSRF on the metadata fetcher
  - Token and secret guessing across every bearer credential
  - IDOR between wishlists
  - **Timing side-channel on every secret comparison path** — owner
    token, hold secret, guest key, guest-data-access secret, and
    `CREATE_SECRET` — per ADR-[036](docs/adr/0036-constant-time-comparison-generalized-to-all-secret.md)'s generalization, not `CREATE_SECRET`
    alone. ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md) made the guest key a plaintext compare, so its path
    is newly load-bearing.
  - **Output escaping across every free-text field**: list `title` and
    `description`, guest name and message, manual-gift giver name and
    description, payment-method `label`/`handle`/`instructions`, and
    `privacyNotice`. §[3.21](#321-threat-model) claims escaping as the stored-XSS mitigation;
    this is what verifies it. The list is enumerated rather than
    described so a field added later without a test is visible as an
    omission.
  - **URI-scheme restriction** (ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)): a `custom` payment method is
    never rendered into an `href`, and a `javascript:` or `data:` handle
    cannot escape the text/QR path. ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)'s detail block states this
    closes a `javascript:`-URI XSS path against the app's own origin — a
    claim with no test behind it until now.
  - **Owner-token transport** (ADR-[064](docs/adr/0064-the-owner-token-never-travels-in-a-url.md)): no route accepts the owner
    token as a query or path parameter, and no owner-facing response
    embeds it in a link.
  - **Guest-key transport** (ADR-[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md)): no request to `/{slug}` carries
    the key in a query string or path; the key-entry POST body is
    redacted in logs; key entry rejects a cross-origin POST.
  - Rate-limit threshold enforcement (§[3.21](#321-threat-model))
- Backup/restore round-trip test: `VACUUM INTO` backup and JSON export, wipe, restore each, verify equivalence
  — and: a redacted `GuestPii` row round-trips as redacted through both
  backup methods; importing a pre-redaction export over a database
  holding a redacted row leaves the row redacted.
- Migration test: run every migration against a seeded copy of the prior schema version, in CI, to catch failures pre-release
- Load test against real Pi-class hardware to verify the §[3.17](#317-performance--resource-budget) performance/resource budgets — targets are budgets to be measured, not assumptions
- **Rate-limit false-positive test**: simulate many honest guests sharing a single IP (realistic at a physical event on venue wifi) against the per-IP thresholds in §[3.21](#321-threat-model); adjust the per-IP threshold if the false-positive rate proves too aggressive, before v1. Numbers were set as reasonable defaults, not derived empirically — this test is how they get validated. *(ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md))*
  Run the same simulation twice more. Once with the app behind a reverse
  proxy and `TRUSTED_PROXY_HOPS` left at 0, asserting the
  misconfiguration warning fires and the per-IP limiter is observably
  collapsed — a failure the venue-wifi scenario misses entirely, since it
  addresses the app directly. And once with several simulated guests
  behind one shared VPN egress address: distinct from venue wifi in that
  the guests are unrelated and dispersed, so a lockout penalises someone
  for strangers' behaviour. If either produces an unacceptable
  false-positive rate, the candidate remedy is converting guest-key-entry
  per-IP from a lockout to an added delay, matching the reasoning ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)
  already applied to the per-slug aggregate. *(ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md), ADR-[068](docs/adr/0068-client-ip-resolution-is-a-hop-count.md))*
- **Hold-cap validation test**: same evidentiary status as the rate-limit
  numbers above — `MAX_ACTIVE_HOLDS_PER_SESSION` (default 10) is a
  reasonable estimate, not empirically derived. Simulate a single
  guest/co-host legitimately holding many items at once (e.g. coordinating
  gift logistics for a large family) before v1, and adjust if honest use
  trips it. The contribution ceiling no longer needs this treatment: the
  target-relative multiple is currency-neutral, and the absolute bound is
  an arithmetic guard rather than a money threshold (§[3.4](#34-group-gifts--funds), ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md)).
- **Currency handling tests** (ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md)): amounts round-trip exactly through
  storage, JSON export, and `rebuildProjections` for a zero-decimal (JPY),
  two-decimal (USD), and three-decimal (KWD) currency; major→minor parsing
  is correct at the input boundary for each; an invalid currency code is
  rejected at write time; a currency change is rejected once a priced item
  exists.
- Timezone correctness tests, run against fixed `Clock` values: an event
  in a zone west of UTC does not reveal early; an event east of UTC does
  not reveal a day late; a `revealAfter` boundary crossing a DST
  transition resolves to the correct instant; `revealedAt` stickiness
  survives a subsequent timezone change in both directions
  — and: `revealAfter` entered as a local date and time resolves to the
  correct instant through the list timezone, including across a DST
  boundary; a later `eventDate` or `timezone` edit leaves the stored
  instant unmoved while its rendered local time changes; `purgeAt`
  re-derives on the same edit; and `revealedAt` is set by an owner
  request that only reads settings, before any edit in that request is
  applied, so a `revealAfter` edit made after the crossing but before any
  dashboard view cannot re-hide claim status.
- Concurrency test for the cross-item hold cap: N parallel hold requests
  from one session against distinct items, verifying the cap holds under
  the in-transaction read (§[3.9](#39-backend-architecture)) and that no TOCTOU window exists
- Idempotency test: replaying an identical submit key against the same
  item returns the original hold/contribution rather than creating a
  second, and the constraint survives `rebuildProjections`
- **Manual-contribution correction test** (ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md)): correcting a manual
  entry's amount voids the original and records a replacement carrying
  the *original* `piiRef`; `item_state.confirmedMinor` reflects only the
  replacement; an existing `thank_you_status` row follows to the new
  contribution id rather than orphaning; redacting the live entry leaves
  no un-redacted name on the voided one; the voided row survives
  `rebuildProjections` as voided. Separately: a name/message edit on a
  manual entry emits no event, is rejected against a `source = guest`
  entry, and is rejected once `redactedAt` is set.
- **Redaction and erasure tests** (ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)): after redacting a
  `GuestPii` row, verify every `piiRef` referencing it still resolves to
  a real row; `name`/`email`/`message` are null while the referencing
  hold or contribution's amount, item, status, and date are unchanged;
  `redactedAt` is set and no code path clears it; and the row renders as
  "[Redacted]" in the reconciliation view, the thank-you view, and the
  CSV export. Redaction succeeds regardless of `revealedAt` or the
  spoiler toggles (§[3.7](#37-privacy)). For guest-initiated erasure via
  `/{slug}/my-data/{secret}`: the bulk action redacts every hold and
  contribution belonging to that session on that list and nothing
  belonging to any other session or list; a secret issued for one list
  does not resolve on another; and the `GuestDataAccess` row is created
  on a session's first hold or contribution rather than at session
  start, so a browsing-only session accumulates no secret. After a key
  rotation (§[3.1](#31-access--identity), `keyGen`): a link issued before the rotation still
  resolves and returns exactly its own pre-rotation records; a link
  issued afterwards covers only post-rotation records; neither returns
  the other's; and no rotation revokes an already-issued link.
- **`piiRef` integrity assertion** (ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)): a structural test over the
  event-payload schemas asserting that no event type carries a `name`,
  `email`, or `message` field directly. This guards ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s central
  claim against silent regression as new event types are added — a
  behavioural test cannot catch a payload that simply starts carrying
  PII again. Runs in the same CI stage as the layer-boundary lint
  (§[3.9](#39-backend-architecture)), both being architecture constraints rather than behaviour.
- **Email retention test** (ADR-[065](docs/adr/0065-one-periodic-task-with-giver-email-purge-attached.md)): a `GuestPii` row past
  `expiresAt + 7 days` has `email` nulled while `name` and `message`
  survive; a row inside the window is untouched; a purchased or released
  hold ages out on the same clock as an expired one; the task is
  idempotent across repeated runs; and a redacted row is unaffected
  (already null).
- Coverage targets meaningfully lower on the front-end — chasing 90% on components produces markup assertions

### 3.14 Owner dashboard & editing rules

- **Item deletion**: items with zero events on their stream may be hard-deleted.
  Items with any history (hold, purchase, or contribution — pledged or
  confirmed) can only be **archived** (`archivedAt` set), hiding them from
  guests while preserving them for reconciliation and thank-you export.
  Archiving is reversible.
- **Quantity reduction**: permitted below the currently committed count.
  Existing holds/purchases are grandfathered; new holds are blocked until
  releases/expiries bring committed count back under the new quantity.
- **Price/target changes** (group, fund): permitted at any time, including
  after contributions exist. `targetMinor` is read live at contribution time,
  never snapshotted, so no historical rewrite occurs. A reduction that would
  immediately overfund the item triggers a confirming dialog before saving.
- **Spoiler-mode interaction**: while `ownerSeesClaimStatus` is off and
  the list has not yet revealed, blocked edits (delete, in edge cases
  quantity) return a generic reason with no counts. Once revealed, claim
  status and identity become visible to the owner regardless of the
  toggles. "Revealed" means `revealedAt IS NOT NULL OR now >= revealAfter`
  — a stored flag set once on first crossing, so the transition is one-way
  and a later timezone or event-date edit cannot re-hide what the owner has
  already seen. *(ADR-[020](docs/adr/0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md), ADR-[052a](docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md))*
- **Payment methods**: managed from list settings — add, edit, reorder,
  remove. Editing a method's label or handle does **not** rewrite existing
  contributions, which retain their snapshot (ADR-[047](docs/adr/0047-contribution-snapshots-its-payment-method-at-pledge-time.md)); the reconciliation
  view surfaces a quiet marker where a contribution's snapshotted handle
  differs from the currently configured one, so the owner knows which
  account older pledges were sent to. Removal is blocked while it is the
  last method and any non-archived `group`/`fund` item exists.
- Adding a `group` or `fund` item with no payment method configured is
  blocked, with an inline prompt to add one rather than a bare error. An
  owner who intends to accept only in-person/offline contributions (cash
  handed over, no guest-facing rail at all) is not actually blocked from
  that model — a `custom` method such as "Cash at the event, ask me"
  satisfies the invariant with a `text`-only render strategy and no real
  guest-facing integration burden. This is a documentation note, not a
  spec or domain change: it closes the apparent tension between the hard
  block (§[3.14](#314-owner-dashboard--editing-rules), carried-forward flag) and manual contributions/
  `ManualGiftEntry` (§[3.6](#36-manual-contributions), ADR-[061](docs/adr/0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)) both supporting a null/no-online-rail
  path, without weakening the block itself.
- **Privacy notice**: free-text field (≤1000 chars) in list settings,
  same escaping treatment as names/messages. Empty by default. A short
  inline hint links to the docs template (§[3.20](#320-governance-licensing--release-process)) rather than pre-filling
  it in the field itself, so the owner makes an active choice about the
  content rather than shipping unedited placeholder text to guests.
  *(ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md))*
- **Hold release**: the owner may release any active hold from the
  dashboard (see §[3.3](#33-holds-single-items)), emitting `HoldReleased`. Confirming dialog states
  the holder's name where spoiler settings permit it to be shown, and a
  neutral "release this hold" otherwise.
- **Timezone / event date changes**: editing either re-derives `purgeAt`
  rather than rewriting a stored instant, and a change that would move
  `purgeAt` into the past is blocked. `revealAfter` is **not** re-derived
  — it is a stored instant (ADR-[066](docs/adr/0066-revealafter-is-stored-not-derived.md)), so an edit leaves it where the
  owner put it; the screen shows it re-rendered in the new zone, since
  the moment is unchanged but its local reading is not. Editing
  `revealAfter` itself is a separate, explicit control on the same
  screen. If `revealedAt` is already set, the dialog states plainly that
  claim status remains visible and will not be re-hidden. *(ADR-[052a](docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md),
  ADR-[066](docs/adr/0066-revealafter-is-stored-not-derived.md))*
- **Approaching-purge notice**: once `purgeAt` is within 14 days, the
  dashboard shows a persistent banner stating the date in the list
  timezone (§[3.22](#322-time-timezones--display)) and linking the CSV export (above). Purge is silent
  and irreversible, and SMTP is optional (§[3.11](#311-ops)) so no email can be
  relied on — an in-app warning is the only notice the owner is
  guaranteed to be able to receive.
- **Reconciliation view**: per-item table of contributions — contributor,
  amount, method, state (pledged/confirmed), source (guest/manual), date.
  Guest rows: confirm or void. Manual rows: void, or **correct** — a
  single action that voids the existing entry, records a replacement
  reusing the same `piiRef`, and re-points any `thank_you_status` row at
  the new contribution id, so a correction never silently drops a
  thanked flag. Reusing the row is not a shortcut: the two entries are
  the same gift from the same person recorded twice, so a later
  redaction correctly strips identity from both rather than leaving a
  name on the voided row behind the toggle. One owner click, three
  independent writes; the same shape as the combined "also mark as
  purchased" checkbox below (ADR-[061](docs/adr/0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)), with no coupling introduced at
  the domain level. Name and message corrections are a separate,
  lighter in-place edit that emits no event at all (§[3.6](#36-manual-contributions)). Voided rows
  are hidden by default behind a "show voided" toggle. *(ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md))*
  List-level summary
  shows total confirmed, total outstanding pledged, and items awaiting
  confirmation.
- **Thank-you view**: merges single-item purchases, group/fund
  contributions (confirmed shown plainly; pledged-but-unconfirmed
  flagged), and manual gift entries (non-monetary offline gifts —
  always shown as fulfilled, since there's no pledged/confirmed
  distinction for something already physically given). No auto-merge by
  contributor name (names aren't unique) — sortable by name or item
  instead. Per-row "mark as thanked" backed by `thank_you_status`, which
  now references `manualGiftEntryId` as a third target alongside
  `contributionId`/`purchaseId`. On-demand CSV export (name, item,
  amount/type, date, thanked) — manual gift rows render the description
  in the amount/type column and leave amount blank. Redacted rows export
  with `[Redacted]` in the name column, matching the on-screen treatment
  — a blank would read as a data bug, and the pre-redaction name would be
  an erasure failure in the most portable format the system produces.
- **Add offline gift**: an owner-authenticated action from the
  thank-you view, recording a giver name (required), a free-text
  description (required, ≤300 chars, escaped on output), and an
  optional link to an existing list item (typeahead over current items;
  left unset for a gift with nothing on the list). No amount, no
  payment method, no ledger event — pure bookkeeping alongside
  `thank_you_status`. The owner may edit or delete any entry directly,
  in full: the entity sits entirely outside the event stream, so there
  is no payload to contradict and nothing to void. This is deliberately
  **not** the treatment manual *contributions* receive (§[3.6](#36-manual-contributions), ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md)),
  which are ledger events and therefore voidable rather than editable —
  the two differ because one is on the ledger and one is not, not by
  oversight.
  Deletion doubles as this entity's erasure path — unlike `Contribution`/
  `Hold`, nothing in the event log references a `ManualGiftEntry` via
  `piiRef`, so full deletion carries no dangling-reference risk the way
  it would for ledger-linked PII (§[3.7](#37-privacy), ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)).
  **Combined action for the common case**: when the linked item is a
  still-available `single`, the form shows a checkbox — "Also mark this
  item as purchased" — checked by default. Confirming with it checked
  fires both the existing `ItemPurchased` event (§[3.3](#33-holds-single-items)) and creates the
  `ManualGiftEntry` in one owner action; unchecking it (or linking a
  `group`/`fund` item, or an already-purchased/no item at all, where the
  checkbox doesn't apply or render) leaves the item's state untouched and
  records the entry as pure bookkeeping, per the advisory-link invariant
  above. This does not blur the domain model — one owner click can still
  produce two independent writes — it only removes the friction of two
  separate dashboard actions for what is, in the common case, one
  real-world event.
- **Redact guest info**: available per-row on both the reconciliation and
  thank-you views — "Redact this guest's info," with a confirming dialog
  stating it's permanent. Redacted rows render "[Redacted]" wherever a
  name would show; amount/item/status/date remain visible and unaffected.
  Manual gift entries on the thank-you view show **"Delete this entry"**
  rather than "Redact this guest's info" — the difference is deliberate,
  not an inconsistency: nothing in the event log references a
  `ManualGiftEntry` via `piiRef`, so outright deletion is safe there and
  is this entity's erasure path (ADR-[061](docs/adr/0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)), whereas ledger-linked PII must
  be redacted in place to keep every reference resolving (ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)).
  *(ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))*
- **Bulk add**: newline-separated URLs, each run through the existing
  SSRF-guarded metadata fetcher; failed fetches still create the item with
  blank metadata.
- **Reorder**: drag-and-drop over existing `sortOrder`; sparse increments to
  avoid full-table rewrites. Keyboard-operable move-up/move-down controls
  are provided alongside the drag handle (see §[3.16](#316-accessibility--browser-support)) — a presentation-layer
  addition, no change to the underlying `sortOrder` mechanism.
- **Duplicate detection**: advisory only (normalized URL match warns on add);
  no DB constraint, no hard block.
- **Guest invite artifact**: an owner-authenticated "Get invite QR" action,
  available at any time, builds the keyed link (`/{slug}#key={key}`, ADR-[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md)) from
  the plaintext key already on file and renders it as a locally generated
  SVG QR, alongside the plain-text link and bare key. No third-party
  service — reuses the existing local QR generation from §[3.5](#35-payments). Because the
  key is plaintext, this needs no decryption step and no special-cased
  availability window; rotating the key immediately invalidates any
  previously generated/printed cards, as the old key stops working.
  *(ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md), ADR-[055](docs/adr/0055-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md))*

### 3.15 Guest UX — browse, hold, contribute (mobile-first, 375px)

**Browse view**
- Single-column card list. Each card: image/placeholder, title, price or
  funding progress bar, status badge (Available / Held / Purchased /
  Funded), primary action button sized ≥44px tap target.
- Filter chips: **All** (default) / Still available / Claimed or funded.
  "All" deprioritizes (visually mutes, sorts after) claimed items rather
  than hiding them — guests frequently want to confirm what's already taken.
- Sort control (plain-language labels, single select): Owner's order
  (default = `sortOrder`) / Price: low to high / Price: high to low /
  Newest.
- Category filter only rendered if the list actually uses categories
  (progressive disclosure — most lists won't).
- Tapping a card opens a full-screen item detail (not a modal) with
  notes, image, and a sticky bottom action bar — keeps the
  scrollable list itself dense and scannable on small screens.
- **Privacy notice link**: after key entry, when the owner has set
  `privacyNotice`, a small "Privacy" link appears in the guest page
  footer opening the notice as plain text. When unset, no link renders —
  no dead affordance pointing at nothing. The key gate instead carries
  the static app-authored statement (§[3.1](#31-access--identity)), which renders unconditionally
  whether or not the slug exists. *(ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md))*

**Empty / near-empty / fully-claimed states**
- **Empty list** (owner hasn't added items yet): "This list is still being
  put together — check back soon." No claim counts and nothing
  identifying the owner beyond the list `title`, which the guest has
  already seen on entering the key — nothing new leaked.
- **Near-empty** (most single/group items claimed): no special UI beyond
  the filter/sort behavior above — available items naturally surface first.
- **Fully claimed**: only shown when every `single`/`group` item is
  held-or-purchased/fully-funded **and** no open-ended `fund` items remain
  accepting contributions. Banner: "Everything on this list has been taken
  care of — thank you!" If open-ended funds are still open, they're listed
  below the banner instead of hiding the page entirely.

**Hold flow**
- Tap "Hold it" → sheet with: name (required), optional email ("so we can
  remind you before the hold expires" — only shown if `SMTP` is configured,
  per the capability-flag rule in §[3.11](#311-ops)), optional message to the owner
  (≤300 chars), duration stated plainly ("Held for you for 3 days").
  Primary CTA: "Confirm hold."
- Confirmation screen: **"Mark as purchased"** is the primary action (per
  §[3.3](#33-holds-single-items)). The private hold link (`/{slug}/hold/{holdSecret}`) is shown
  prominently with a "Copy link" button and a line explaining it's the way
  back in if they lose their session — non-technical guests without the
  optional email have no other recovery path, so this can't be buried in a
  menu.

**Contribute flow ("cover the rest")**
- For items *with* a target (`group`, or `fund` with `targetMinor` set):
  suggested-amount buttons computed from the live remainder — ¼, ⅓, ½,
  "Cover the rest" — plus a custom-amount field. **This selection is
  informational/client-side only and is not written to the server** — it
  guides the guest and, where a provider's deep link supports it, prefills
  the payment app's own amount field.
- For open-ended `fund` items (no target): no remainder-based suggestions —
  flat preset amounts derived from the list's currency exponent
  (§[3.5](#35-payments), ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md)) at three round magnitudes, plus custom,
  same informational-only treatment.
- "Cover the rest" is hidden once remainder ≤ 0 under `allowOverfunding:
  block`; kept visible with a confirming dialog under `warn`/`allow`.
- Name (required), optional message to owner (≤300 chars, same field/cap as
  holds), then payment method selection from the list's configured methods
  (single method: skip selection, render it directly) with the honest
  "we can't verify this automatically" disclaimer, then deep link / QR /
  copyable handle per that method's render strategy.
- The guest leaves the app and sends money via the chosen rail.
- On return, **the amount is entered and the `Contribution` row is created
  only at "I've sent it"** — prefilled from the earlier selection but
  editable, since what was actually sent may differ (rounding, a changed
  mind, a typo in the payment app). Remainder is checked server-side at
  this single submission point (optimistic concurrency); if it changed,
  the guest sees the updated remainder before confirming rather than
  silently overfunding. This records the pledge with the method snapshot
  attached.
- The contribution confirmation screen ("I've sent it" succeeded)
  surfaces the same guest self-service data link (§[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)) the hold
  confirmation screen shows — the guest's one durable way back into "what
  do you have on me," regardless of which flow created it.
- No pre-payment draft state exists server-side — closing the tab before
  this step leaves nothing to recover; the guest simply redoes the
  (client-only) selection. This is why no dedicated contribution recovery
  secret is issued (ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)) — only the same-session hint (§[3.1](#31-access--identity)) helps
  with accidental resubmission, and only on the same device/session.
- Combined progress bar (solid = confirmed, hatched = pledged) shown both
  on the item card and inside this flow before/after submission.

**Double-submit protection**

- Both the hold sheet and the contribute flow carry an idempotency key,
  generated client-side (`crypto.randomUUID()`) **when the sheet/flow is
  opened**, not when submit is tapped — generating it at submit time would
  produce a fresh key per tap and defeat the mechanism entirely.
- The key is sent with the POST and persisted with the resulting hold or
  contribution. A replay of the same key against the same item returns the
  original result — the same confirmation screen, the same hold secret —
  rather than creating a second record or surfacing an error.
- This is an honest-guest correctness guard first: a slow response over
  venue wifi followed by a second tap is close to certain at a real event,
  and would otherwise produce two pledges against one payment, or two holds
  where the guest can only recover the second hold's secret. *(ADR-[050](docs/adr/0050-hold-contribution-submits-carry-a-client-generated.md))*

**Message from giver to owner**
- Optional free-text field, ≤300 chars, on both the hold sheet and the
  contribute flow. Escaped on output, same treatment as names.
- Visible to the owner **immediately**, regardless of
  `ownerSeesClaimStatus`, `ownerSeesClaimerIdentity`, or `revealAfter` —
  treated as a personal note, not claim-status information that spoiler
  settings are meant to protect. *(ADR-[023](docs/adr/0023-giver-message-visible-to-owner-immediately-not-spoiler-gated.md))*

### 3.16 Accessibility & browser support

- **WCAG target: 2.2 Level AA**, across both guest and owner UI — upgraded
  from an initial 2.1 target once it was noted that 2.2's SC 2.5.7
  (Dragging Movements) directly covers the keyboard-alternative requirement
  already specified below for drag-to-reorder, making 2.2 the better fit
  rather than an arbitrary version bump. AA remains the level (not AAA):
  it's what ADA expectations, Section 508, and EN 301 549 reference as the
  practical baseline, and AAA's contrast/timing requirements conflict with
  normal visual design work without being expected anywhere this project
  would ship. *(ADR-[024](docs/adr/0024-wcag-2-2-level-aa-is-the-accessibility-target.md))*
- **Keyboard navigation**: every interactive control reachable and operable
  via keyboard, built from native semantic elements (`button`, `a`, form
  controls) rather than `div`/`span` with click handlers. Visible focus
  indicators are never removed, only restyled to match the design. Tab order
  follows visual/reading order. A skip-to-content link is provided on the
  guest browse page ahead of the filter/sort controls.
- **Focus management**:
  - Opening the full-screen item detail view moves focus to its heading;
    closing it (or navigating back) returns focus to the card that opened it.
  - The hold sheet and contribute flow are implemented with the native HTML
    `<dialog>` element rather than a hand-built focus trap — it provides
    focus-trapping, `Escape`-to-close, and correct dialog semantics without
    reimplementing them, and is well-supported across the browser matrix
    below. A custom focus-trap implementation is the documented fallback
    only if `<dialog>` proves too constraining for the intended design.
    *(ADR-[025](docs/adr/0025-hold-sheet-and-contribute-flow-use-native-dialog.md))*
  - Drag-and-drop reorder (§[3.14](#314-owner-dashboard--editing-rules)) gets a keyboard-operable alternative —
    move-up/move-down buttons alongside the drag handle — since drag
    gestures have no keyboard equivalent by default. Presentation-layer
    addition only; the underlying `sortOrder` mechanism is unchanged.
- **Screen-reader announcements**: a dedicated ARIA live region carries
  status changes rather than relying on visual-only toasts.
  - Success confirmations (hold confirmed, contribution recorded) use
    `aria-live="polite"` — announced without interrupting whatever the user
    is doing.
  - Validation errors use `aria-live="assertive"`, associated with the
    specific field (e.g., "Name is required"), since these need immediate
    attention before the guest can proceed.
  - Status badges (Available / Held / Purchased / Funded) always pair an
    icon and text label — never color alone.
- **`axe` in the Playwright run**: `@axe-core/playwright` is wired into the
  existing guest-flow e2e suite (§[3.13](#313-testing)), scanning the key gate, browse view,
  item detail, hold sheet, contribute flow, and — on the owner side — the
  dashboard, reconciliation view, and thank-you view. CI fails the build on
  **serious/critical** violations; moderate/minor violations are logged as
  warnings. Because automated tools like axe are widely cited as catching
  only roughly 30–50% of real WCAG issues (they can't verify a live region
  actually announces correctly in a screen reader, or that tab order is
  *logically* sane rather than merely present), CI is not treated as
  sufficient on its own: a manual keyboard-only pass and a manual
  screen-reader pass on the hold and contribute flows (the two
  commitment-critical paths) are required before v1, tracked as a release
  checklist item rather than left as an informal recommendation. The
  moderate/minor ratchet also gets a concrete checkpoint — **zero moderate
  violations required before the v1.0 release** — tracked as a Forgejo
  issue, rather than an open-ended "tighten over time" intention that could
  silently become permanent debt. *(ADR-[027](docs/adr/0027-axe-core-wired-into-e2e-ci-blocks-on-serious-critical-only.md))*
- **Browser support matrix**: last 4 major versions of Chrome, Firefox,
  Safari, and Edge, and the last 4 major versions of iOS Safari and Chrome
  for Android — widened from an initial "last 2 / current" target once it
  was noted that a wedding/baby-shower guest list skews toward relatives on
  older, un-upgraded devices, including iPhones capped below the current
  iOS version (and therefore capped below the current Safari version too).
  No support target for Internet Explorer or legacy (pre-Chromium) Edge.
  Beyond the version floor, the **hold and contribute flows specifically**
  must degrade gracefully rather than fail outright on an unsupported or
  older browser: they rely on semantic HTML forms and standard `fetch`,
  avoid depending on bleeding-edge CSS/JS features for the ability to
  *submit*, and cosmetic degradation (older visual styling, missing
  animation) is acceptable where functional failure is not. The owner
  dashboard keeps the tighter "last 2 versions" target, since owners are a
  small, self-selected group unlikely to be on legacy devices — this
  distinction reflects the different audiences of the two surfaces rather
  than a single uniform matrix. *(ADR-[028](docs/adr/0028-browser-support-matrix-widened-for-the-guest-facing-surface.md))*
- **i18n groundwork (formatting, not translation)**: all currency and
  date/time display goes through `Intl.NumberFormat`, `Intl.DateTimeFormat`,
  and `Intl.RelativeTimeFormat` (e.g., "expires in 2 days") rather than
  manual string building, using the item's stored currency and the request's
  browser/`Accept-Language` locale for formatting. UI copy is centralized in
  a single strings module, built on an ICU MessageFormat-compatible library
  (e.g. `intl-messageformat`) rather than plain template strings, so
  plurals/gender/variable interpolation are translation-safe from day one
  even though no translations ship yet — a stronger technical readiness bar
  than a bare strings object, adopted specifically because multilingual
  family guest lists (in-laws, international relatives) are a plausible
  near-term need for this project's actual users, not a hypothetical one a
  typical B2B tool could safely wave off. No locale-switcher or translated
  string sets ship now — full localization delivery is still deferred under
  YAGNI, since no requirement calls for a shipped non-English UI today —
  but the groundwork is deliberately built so a future translation pass
  (community-contributed locale files are the expected path for an OSS
  project) requires no rewrite. Presentation-layer only, no domain impact.
  *(ADR-[029](docs/adr/0029-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md))*

### 3.17 Performance & resource budget

- **Target hardware**: Raspberry Pi 4-class device, 256MB RAM ceiling for the
  app container.
- **API latency (p95)**: reads < 150ms; transactional writes (hold,
  contribution) < 300ms.
- **Guest page FCP**: < 2.5s on simulated 4G, no CDN.
- **Bundle budget**: guest-flow JS < 150KB gzipped; owner dashboard
  code-split separately, no hard ceiling (far fewer users, less latency-
  sensitive).
- **Concurrency target**: ~20 concurrent guest sessions served comfortably;
  beyond that, graceful degradation (slower responses), not failure — no
  request queue, existing rate limiting is sufficient backpressure.
- **256MB decomposition**: `--max-old-space-size=128` for V8;
  `PRAGMA cache_size` capped small (~8MB); image
  fetch/resize concurrency capped at 1, streaming resize rather than
  full-decode, upload size capped; ~60-80MB reserved for OS/container
  overhead.
- Targets are budgets verified by a load test against real Pi hardware
  (see §[3.13](#313-testing)), not guarantees enforced at runtime. *(ADR-[030](docs/adr/0030-performance-resource-targets-set-for-pi-class-hardware.md))*
- A write flood against the single SQLite writer (WAL mode, single-writer)
  degrades latency but cannot corrupt state — this is an accepted instance
  of the "graceful degradation, not failure" stance above, not a
  correctness gap requiring new machinery.

### 3.18 Backup, restore & upgrade safety

- **Logical backup**: existing JSON export/import (§[3.11](#311-ops)) — portable,
  human-inspectable, engine-version-independent. The export includes
  `guest_pii` rows with their `redactedAt` values, since omitting them
  would leave every `piiRef` dangling on restore. Import preserves
  `redactedAt`; where a row already exists in the target database with
  `redactedAt` set, redaction wins regardless of the incoming value, so
  a partial or repeated import can never un-redact. *(ADR-[067](docs/adr/0067-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Physical backup**: `VACUUM INTO <path>` against the live WAL-mode
  database — safe to run without stopping the container, produces one
  consistent, compacted snapshot file. Plain filesystem copy of the `.db`
  file is **not** safe under WAL mode (may miss in-flight WAL/SHM state)
  and must not be documented as a supported method. *(ADR-[032](docs/adr/0032-physical-backup-via-vacuum-into-not-raw-file-copy.md))*
- Both backup methods are documented operator recipes (a bundled script,
  invoked via `docker exec`), not a built-in scheduler — scheduling stays
  the operator's cron, consistent with the single-container/no-separate-
  DB-service posture in §[3.11](#311-ops).
- Deployment guide (Cluster F) must recommend copying backups off-device,
  since the default target (Pi + SD card) is failure-prone.
- **Backup retention**: keep rotating backups for at most 30 days, and
  never longer than `PURGE_AFTER_DAYS` (§[3.11](#311-ops)). A backup outliving the
  database it came from means personal data the live system has already
  deleted persists in a file the operator has probably forgotten. As
  with scheduling, rotation is the operator's cron and the guide
  supplies the recipe — but the window itself is not optional guidance:
  it is what makes the erasure-in-backups obligation (§[3.7](#37-privacy))
  dischargeable, being the "specified length of time" a privacy notice
  has to state. *(ADR-[067](docs/adr/0067-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Migrations are forward-only** (see §[3.11](#311-ops)). Rollback story is "restore
  from the pre-upgrade backup," documented as a required pre-upgrade step,
  not "run a down migration." *(ADR-[033](docs/adr/0033-migrations-are-forward-only-rollback-restore-from-backup.md))*
- **Event schema evolution**: the existing payload `v` field is the seam.
  An upcaster layer (`infrastructure/events/upcasters/`) transforms
  older-versioned event JSON to the current shape before folding. New
  event types are additive only; existing types are never redefined in
  place. *(ADR-[033](docs/adr/0033-migrations-are-forward-only-rollback-restore-from-backup.md))*
- CI migration test: run every migration against a seeded copy of the
  prior schema version to catch failures pre-release.

### 3.19 Observability (logging, metrics, tracing)

- **Logging**: structured JSON via `pino`. Request-scoped context (method,
  path, status, duration, request id) via `pino-http`. PII redaction
  enforced via `pino` `redact` paths (names, emails, keys, tokens) —
  mechanically guaranteed, not just a stated convention. Log level via
  `LOG_LEVEL` (existing).
- **Metrics**: OpenTelemetry Metrics SDK internally; exported via the
  Prometheus exporter at `/metrics` (pull-based, operator-scraped, gated
  by `METRICS_ENABLED`, unauthenticated by design — operator's
  responsibility not to expose publicly). Content includes request latency
  histograms, WAL size, process RSS, reminder-job last-run,
  projection-rebuild duration, and periodic-task last-successful-run and
  last-run-duration, plus a count of emails nulled on the last run — so
  an operator can see the task silently failing rather than inferring it
  from a retention promise quietly going unmet. Using the OTel SDK rather than hand-rolled
  counters keeps the door open for richer instrumentation later without a
  rewrite. *(ADR-[031](docs/adr/0031-logging-metrics-tracing-standardized-on-pino-opentelemetry.md))*
- **Tracing**: OpenTelemetry Tracing SDK. Span exporter defaults to
  **none** (spans created in-process only, optionally dumped to stdout at
  debug level for local troubleshooting) — nothing leaves the container
  by default. An operator may set `OTEL_EXPORTER_OTLP_ENDPOINT` to point
  at their own collector; this is an explicit, informed opt-in by whoever
  runs the box, not the application reaching out unprompted, so it does
  not conflict with the no-outbound-requests principle. *(ADR-[031](docs/adr/0031-logging-metrics-tracing-standardized-on-pino-opentelemetry.md))*
- Every request carries a generated request id, attached to its log
  lines, its active span, and returned as `X-Request-Id` — sufficient
  correlation for single-instance self-hosted debugging without requiring
  a trace backend.

### 3.20 Governance, licensing & release process

- **Licence: AGPL-3.0.** Chosen to keep this project and all future
  adaptations open source, including modified hosted-fork deployments.
  GPL-3.0 was rejected because it has no network-use trigger — a hosted
  SaaS fork never "distributes" anything, so the exact loophole this
  project wants closed stays open under plain GPL. EUPL-1.2 and OSL-3.0
  achieve a comparable network-copyleft effect but offer no advantage
  over AGPL's recognition and ecosystem familiarity (EUPL's main
  edge — EU-jurisdiction legal text and official translations — doesn't
  apply here). SSPL was evaluated and rejected outright: it is **not**
  OSI-approved open source, which directly contradicts the requirement
  that this project and its derivatives stay open source. *(ADR-[039](docs/adr/0039-agpl-3-0-selected-as-project-licence.md))*
- **Code of conduct**: Contributor Covenant, unmodified.
- **CONTRIBUTING.md**: devcontainer-first onboarding; the layer-boundary
  ESLint rule (§[3.9](#39-backend-architecture)) is a hard CI gate, not a style suggestion; changes
  touching the domain model or an existing invariant require an ADR stub
  in the PR.
- **SECURITY.md**: dedicated security-contact email address (optionally
  with a published PGP key) as the reporting channel — Forgejo/Codeberg
  has no GitHub-style private security-advisory feature, so email is the
  disclosure mechanism rather than a structured/tracked in-platform flow.
  Best-effort response time stated plainly; coordinated disclosure;
  "supported versions: latest release" only — no multi-version support
  matrix promised pre-1.0. *(ADR-[041](docs/adr/0041-security-disclosure-via-a-dedicated-email-address.md))*
- **Hosting & CI platform**: Forgejo, deployed via Codeberg. CI is written
  as Forgejo Actions workflows (GitHub Actions-compatible syntax, the
  actively developed path over legacy Woodpecker). *(ADR-[040](docs/adr/0040-ci-hosted-on-forgejo-actions-via-codeberg-not-github-actions.md))*
- **CI pipeline** (PR gate, every push): lint (incl. layer-boundary rule
  and the `piiRef` integrity assertion, §[3.13](#313-testing))
  → typecheck → unit tests + coverage → integration tests (real SQLite)
  → migration test against seeded prior schema (§[3.18](#318-backup-restore--upgrade-safety)) → security tests
  (the full set enumerated in §[3.13](#313-testing)) → Playwright e2e (incl. `axe`, §[3.16](#316-accessibility--browser-support)).
- **Release gate** (tagged releases only, not every push): multi-arch
  Docker build, SBOM generation (CycloneDX via `syft`), dependency
  vulnerability scan, container image scan. Kept off the per-push path
  given Codeberg shared-runner quota limits (materially tighter than
  GitHub's free-tier minutes for open source); a self-hosted Forgejo
  runner is documented as an option for maintainers who want release-gate
  steps on every push instead. *(ADR-[040](docs/adr/0040-ci-hosted-on-forgejo-actions-via-codeberg-not-github-actions.md))*
- **Dependency budget**: tied to the existing guest-bundle budget in
  §[3.17](#317-performance--resource-budget) via a `size-limit`-style CI check, rather than a separate vague
  policy. New runtime dependencies require a one-line justification in
  the PR description; devDependencies unconstrained.
- **Docs**: quickstart (docker-compose one-liner, minimal env vars,
  explicit callout that creation is open-by-default until the first
  list exists); reverse-proxy examples for nginx/Caddy/Traefik
  demonstrating `TRUSTED_PROXY_HOPS` set correctly for each topology, and
  how to verify it from the resolved-address log line (§[3.11](#311-ops)); backup
  guide covering `VACUUM INTO` +
  JSON export/import with an off-device-copy recommendation (per §[3.18](#318-backup-restore--upgrade-safety));
  and an erasure-request section covering the split between guest
  self-service and export (§[3.7](#37-privacy)), the beyond-use commitment, the backup
  retention window (§[3.18](#318-backup-restore--upgrade-safety)), and re-applying a redaction after any
  restore.
- **Quickstart recommends Cloudflare Tunnel plus a local reverse proxy**
  as the primary deployment path — no port forwarding, TLS handled at the
  edge, and `TRUSTED_PROXY_HOPS=2` shipped correct rather than left to
  the operator. The nginx/Caddy/Traefik examples remain fully supported
  for operators who know what they want; the recommendation is a default,
  not a constraint.
- Because the guest key now travels in a fragment (ADR-[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md)), the ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md)
  caveat previously attached to this path — that `?key=` lands in a third
  party's logs the operator cannot configure — **no longer applies**.
  That caveat is why the transport changed.
- **Teardown checklist**: a dedicated doc section (not just a line in the
  quickstart) covering what "done" looks like once the event has passed
  and `purgeAt` has run: stop and remove the container, delete the mounted
  volume (the DB is already purged by then, but the volume may still hold
  WAL/SHM files or old backups — and treat any backup still held as live
  personal data, subject to the same erasure obligations as the database
  itself), revoke/rotate any `CREATE_SECRET` values
  if the instance was ever exposed beyond the operator, and — if the
  operator used Cloudflare Tunnel or a similar always-on proxy — tear that
  down too rather than leaving a public hostname pointed at a stopped
  container. Framed as "an internet-facing box you forgot about is a
  liability, not just clutter," since the realistic failure mode is
  abandonment, not misuse. *(ADR-[057](docs/adr/0057-instance-teardown-addressed-as-a-documentation-checklist.md))*
- **Privacy-notice template**: a short, fill-in-the-blank example in
  `docs/`, covering operator identity/contact, what's collected (names,
  optional emails, messages), retention (tied to `purgeAt`), and the
  backup retention window (§[3.18](#318-backup-restore--upgrade-safety)) alongside `purgeAt` — a guest
  exercising erasure has to be told when backup copies of their data will
  be gone, which is part of the obligation rather than an optional detail
  — and a plain
  statement that this is a self-hosted instance, not a hosted service —
  written for the owner to paste into the `privacyNotice` field and edit,
  not to use verbatim. *(ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md))*
- **Demo instance**: deferred, not rejected. A public seeded demo would
  aid adoption but is real ongoing hosting/maintenance weight for a
  project whose architectural stance is "no infra run on your behalf."
  Revisit post-1.0 once maintenance burden is easier to judge against
  real adoption signal. If pursued later: nightly reset, seeded fake
  data, clearly labeled, same rate limits and `noindex` as production.
  *(ADR-[043](docs/adr/0043-demo-instance-formally-deferred-not-rejected.md))*
- **AGPL compliance for self-hosters**: README and the deployment guide
  explicitly explain that AGPL-3.0's network-use clause applies the moment
  guests interact with a modified instance over the network — not just on
  "distribution" in the traditional sense. Operators who edit the code and
  then let guests use it are responsible for updating `SOURCE_URL` (env
  var, §[3.11](#311-ops)) to point at their own modified source; the app surfaces
  whatever `SOURCE_URL` is currently set to via a footer/about-page link,
  defaulting to the upstream repo so an unmodified deployment is compliant
  out of the box with zero configuration. This is flagged explicitly
  because the target self-hosting audience is often not familiar with
  AGPL's network trigger and could otherwise fall out of compliance in
  good faith. *(ADR-[045](docs/adr/0045-sourceurl-env-var-drives-agpl-3-0-network-use-compliance.md))*

### 3.21 Threat model

Full threat model (assets, actors, threat-by-threat enumeration) lives in
`docs/threat-model.md`. Summary below; this section is the authoritative
spec reference for the two items it resolves (constant-time comparison,
cookie/HTTPS requirement — both folded into §[3.1](#31-access--identity) above) and for the
concrete rate-limit thresholds.

**Assets**: guest key, owner token, hold secrets, session cookies
(the access-control surface); guest PII (names, optional emails,
messages); claim-state secrecy (the "spoiler"); ledger integrity
(no double-spend, no silent overfunding bypass); instance availability
during the event window.

**Actors**: guest with valid slug+key; guest with only the slug (should
learn nothing, per §[3.1](#31-access--identity)); owner; unauthenticated internet (default
assumption for an internet-facing app); a malicious/curious co-guest with
a valid key; a network attacker with proxy/log access; the hosting
operator (explicitly out of scope as an adversary, per §[1](#1-overview)).

**Threats identified, each mapped to an existing or newly-added
mitigation:**

| Threat | Mitigation |
|---|---|
| Guessing/brute-forcing slug, key, token, or hold secret | Unguessable `TokenGenerator` output; rate limiting below; identical generic failure response (ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md)) |
| Guest key interception in transit or at intermediaries | The key travels in a URL fragment, never transmitted to any server (ADR-[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md)), so it appears in no proxy, edge, or application access log; it is POSTed once over TLS with the body redacted from logs (§[3.19](#319-observability-logging-metrics-tracing)). The browser history entry for the originally tapped link remains a disclosed, unmitigable residual risk, as under ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md). The owner token is excluded from URL transport entirely (ADR-[064](docs/adr/0064-the-owner-token-never-travels-in-a-url.md)) |
| Rate-limit evasion via forged `X-Forwarded-For` | Client IP resolved by counting `TRUSTED_PROXY_HOPS` entries from the right, so only addresses appended by a trusted proxy are read and a client-supplied prefix is inert. A count set too high logs a warning and falls back leftward rather than trusting client input (ADR-[068](docs/adr/0068-client-ip-resolution-is-a-hop-count.md)) |
| Self-inflicted lockout via proxy misconfiguration | With the hop count unset behind a proxy, every guest shares one bucket and a handful of key typos locks out the whole list. Detected at request time, warned about, and the resolved address logged once at start; the quickstart and all reverse-proxy examples set it explicitly (ADR-[068](docs/adr/0068-client-ip-resolution-is-a-hop-count.md)) |
| Timing side-channel on secret comparison | Constant-time comparison, generalized to every secret comparison in the system (ADR-[036](docs/adr/0036-constant-time-comparison-generalized-to-all-secret.md)) |
| Session cookie theft (XSS, sniffing) | httpOnly, signed, list-scoped, `Secure`-flagged (ADR-[037](docs/adr/0037-session-and-owner-access-cookies-require-secure-https.md)); strict CSP with no inline scripts reduces XSS surface |
| SSRF via URL metadata fetching | Opt-in only, private-IP blocking, redirect blocking, timeouts (§[3.7](#37-privacy)) |
| Stored XSS via name/message fields | Escaping on output; no rich text anywhere in the input model |
| Double-claim race on a quantity-1 item | `UNIQUE (itemId, seq)` optimistic concurrency, `BEGIN IMMEDIATE`, retry-with-re-evaluation (§[3.8](#38-data--persistence)–[3.9](#39-backend-architecture)); explicit concurrency test (§[3.13](#313-testing)) |
| Overfunding bypass via stale/manipulated client-side remainder | Remainder recomputed server-side at submit time; policy centralized in `canAccept` |
| List/slug enumeration | No public directory; generic not-found responses (ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md)), including for purged slugs — the post-purge response is identical to never-existed, not a distinguishable tombstone (ADR-[056](docs/adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md)) |
| DoS against a resource-constrained instance | Auth-route rate limiting (below); write-flood degrades latency, not correctness, under WAL mode (§[3.17](#317-performance--resource-budget)) — accepted as "graceful degradation," not a gap |
| Data-at-rest theft (stolen DB file or backup) | Out of application scope by design — an operator/OS-level concern (encrypted volume, LUKS), named explicitly so it isn't silently assumed away (§[3.7](#37-privacy)). Applies uniformly to all plaintext bearer secrets (guest key, owner token, hold secrets — ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)) |
| Owner impersonation via leaked shared owner token | Rotation, preserving history (ADR-[015](docs/adr/0015-owner-tokens-are-shared-per-list-not-per-owner.md)) |
| URI-scheme injection via owner-supplied payment handle | `custom` methods are text/QR only and never rendered as a link; deep links restricted to shipped provider templates with an `https:`-plus-declared-app-scheme allowlist. Instructions text escaped on output like names/messages (ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)) |
| Ledger pollution or hold-hoarding by a guest with a valid key | Concurrent-hold cap per session (ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)); contribution sanity ceiling (ADR-[049](docs/adr/0049-contribution-amounts-bounded-by-absolute-and-target.md)); owner-side void and hold-release as the reversal path. Session-scoped caps are a blast-radius limiter, not an identity control — a determined actor clears cookies. Detection-and-reversal plus key rotation remains the real defence, consistent with the non-goals below |
| Duplicate pledge/hold from an accidental or replayed submit | Idempotency key persisted with a uniqueness constraint; replay returns the original result (ADR-[050](docs/adr/0050-hold-contribution-submits-carry-a-client-generated.md)) |
| Premature spoiler reveal via timezone ambiguity | `eventDate` resolved to instants through the list's IANA timezone rather than server-local midnight, so an event west of UTC cannot reveal early (ADR-[051](docs/adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md)) |
| Unpatched instance left running indefinitely after its event has passed | Documented teardown checklist (§[3.20](#320-governance-licensing--release-process), ADR-[057](docs/adr/0057-instance-teardown-addressed-as-a-documentation-checklist.md)) — no active app-level enforcement; the dominant single-list deployment shape (ADR-[014](docs/adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md), ADR-[053](docs/adr/0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)) makes cross-list "everything's expired" tooling a poor complexity trade for now |
| Guest-data-access secret guessing | Unguessable `TokenGenerator` output; rate limiting below; same generic-failure response pattern as other lookups (§[3.1](#31-access--identity), ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)) |
| Guest-data-access secret exposed via URL (link sharing, referrer, shoulder-surfing) | Grants access to that guest's own data only — no cross-guest or owner-level access — and the sole action beyond viewing is deleting that same guest's own data, so the worst case of a leaked secret is self-limited to one guest's own records |

**Explicit non-goals** (restated from §[1](#1-overview) for the threat model's own
completeness): protection against a hostile server operator; protection
against a legitimately-keyed guest who shares their access outside the
invite list (a social/physical trust boundary, not a software one);
cryptographic non-repudiation of pledged payments (a threat the product
design accepts, not one the software fails to mitigate — payment rails are
unverifiable by design, per §[3.5](#35-payments)); and *prevention* (as opposed to
limitation and reversal) of abuse by a guest who holds a valid key — the
caps in ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)/[049](docs/adr/0049-contribution-amounts-bounded-by-absolute-and-target.md) bound the damage a casual abuser can do in one session,
but a session identifier is not an identity and cannot be made into one
without accounts.

**Rate limiting — concrete thresholds.** Stored in a `rate_limit_attempts`
SQLite table, fixed-window, lazily expired the same way hold expiry is
(§[3.3](#33-holds-single-items)) — no cron sweep, no new service dependency (§[3.8](#38-data--persistence)). Every
lockout/slowdown state returns the same generic message as ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md); a
distinct "too many attempts" message would itself leak slug existence.

| Route | Per-IP threshold | Lockout | Aggregate (per-slug) |
|---|---|---|---|
| Guest key entry | 5 failed / 15 min | 15 min | 30 failed/hr across all IPs → 2s added delay per attempt for 1hr (deliberately **not** a full slug lockout — a guest who knows the slug shouldn't be able to lock out the entire guest list by feeding it wrong keys on purpose) |
| Owner token entry | 5 failed / 15 min | 30 min | — (single credential; no meaningful aggregate) |
| Hold-secret link (`/{slug}/hold/{holdSecret}`) | 10 failed / 15 min | 15 min | — |
| Guest-data-access link (`/{slug}/my-data/{secret}`) | 10 failed / 15 min | 15 min | — |
| `CREATE_SECRET` | 5 failed / hr | 1 hr | — |

Counters reset on successful auth. *(ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md))*

Note that the thresholds above govern **credential-proving routes only**.
Post-authentication guest writes are bounded separately and semantically,
not by rate limit — see the concurrent-hold cap (§[3.3](#33-holds-single-items)), the contribution
sanity ceiling (§[3.4](#34-group-gifts--funds)), and ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)'s reasoning on why a per-session write
throttle was considered and rejected in their favour.

**Flagged for empirical validation, not resolved by policy alone**:
per-IP thresholds assume one attacker per IP, but guests at a physical
event (wedding, shower) frequently share venue wifi — a realistic
false-positive path where several honest guests get bucketed as one
actor. Added to §[3.13](#313-testing) as an explicit pre-v1 test: simulate many guests
on one IP and verify the false-positive rate before shipping these
numbers as final; adjust the **per-IP** threshold (not the per-slug one)
if it proves too aggressive. *(ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md))*

### 3.22 Time, timezones & display

The spec distinguishes two kinds of time, which are stored and rendered
differently. Conflating them is the source of the failure this section
exists to prevent. *(ADR-[051](docs/adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md))*

**Instants** — `expiresAt`, `pledgedAt`, `confirmedAt`, `archivedAt`,
`thankedAt`, `revealedAt`, and all event timestamps. Stored as UTC.
Unambiguous by construction; each viewer sees them in their own zone.

**Civil dates** — `eventDate`. A calendar day belonging to the event, not
a point in time. Stored as `YYYY-MM-DD` with no zone attached, and
resolved to instants only via the list's `timezone`.

**Resolution rules**

- `revealAfter` is a stored instant, set at creation from a prefilled
  field defaulting to the **end** of `eventDate` in the list timezone
  (23:59:59.999 local), so an event day is fully over before claim
  status reveals. The owner enters a local date and time; it is resolved
  through `timezone` at write and stored. Editing `eventDate` or
  `timezone` afterwards does not move it — the settings screen shows the
  stored instant resolved in the current zone, so any change in how it
  reads is visible at the point of editing. *(ADR-[066](docs/adr/0066-revealafter-is-stored-not-derived.md))*
- `purgeAt` is the end of `eventDate + PURGE_AFTER_DAYS` days in the list
  timezone.
- Hold `expiresAt` is a pure instant — `now + holdDuration` — with no
  timezone involvement at all. Its *display* is localized (below); its
  computation is not.
- The `Clock` port returns an instant only. No "today", no civil-date
  arithmetic below the presentation layer, so a zone can never be
  implied by omission.
- The list timezone defaults at creation from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to
  `DEFAULT_TIMEZONE` (§[3.11](#311-ops)) when unavailable. Presented on the creation
  screen as a prefilled, editable field — visible enough to correct, not
  a question the owner must research.

**Display rules — timezone is always stated, never implied**

- Every absolute date or time shown to a guest or owner carries its zone.
  Rendering an instant in the viewer's local zone without saying so is the
  failure mode this rule targets: a guest cannot tell whether "expires
  Thursday 11pm" is their Thursday or the venue's, and the ambiguity lands
  hardest on exactly the commitment-critical paths (hold expiry, event
  date).
- Formatting via `Intl.DateTimeFormat` with `timeZoneName: 'short'` for
  compact contexts (cards, badges) and `'longGeneric'` where space allows
  (item detail, hold confirmation, owner dashboard) — per ADR-[029](docs/adr/0029-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md), never
  hand-built strings, and never a hardcoded abbreviation.
- **Where the viewer's zone differs from the list timezone**, times are
  rendered in the viewer's zone with the list zone shown alongside — e.g.
  "Held until Thu 14 Aug, 11:59 PM CEST (2:59 PM event time)". A relative
  in another country should never have to work out the offset themselves.
- **`eventDate` is shown as a civil date with the list timezone named**,
  never converted to the viewer's zone. A guest must not see "Event: 13
  June" because their phone sits behind the venue.
- **Relative time is always paired with a labelled absolute time**, never
  shown alone. `Intl.RelativeTimeFormat` output ("expires in 2 days") is
  zone-neutral and friendly but imprecise at the boundary, which is where
  a guest most needs certainty.
- **Screen-reader output uses the long zone name, not the abbreviation** —
  "Central European Summer Time", not "CEST", which reads as a nonsense
  word. Where the visible label is abbreviated, the accessible name
  carries the long form. Extends §[3.16](#316-accessibility--browser-support). *(ADR-[051](docs/adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md))*
- The owner's settings screen states the current list timezone plainly
  alongside the resolved `revealAfter` and `purgeAt` instants, so the
  consequence of the field is visible at the point of editing rather than
  discovered later.

---

## 4. ADR Index

Individual decisions are written up one file per ADR in [`docs/adr/`](docs/adr/README.md), numbered 0001–0071 with 0052a as a documented numbering exception — see that directory's README for the index and the 052/052a numbering note. Citations elsewhere in this document (e.g. "ADR-[066](docs/adr/0066-revealafter-is-stored-not-derived.md)") link directly to the relevant file.

---

## 5. Open Questions

Grouped into decision clusters. Each cluster is a separate chat.

### Cluster A — Instance setup & onboarding — ✅ Resolved (see §[3.1](#31-access--identity), §[3.11](#311-ops), ADR-[014](docs/adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md)/[015](docs/adr/0015-owner-tokens-are-shared-per-list-not-per-owner.md)/[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md))

### Cluster B — Owner dashboard & editing rules — ✅ Resolved (see §[3.14](#314-owner-dashboard--editing-rules), ADR-[017](docs/adr/0017-items-with-ledger-history-are-archived-not-deleted.md)–[021](docs/adr/0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md))

### Cluster C — Guest UX & empty states — ✅ Resolved (see §[3.1](#31-access--identity) addendum, §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px), ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md)/[023](docs/adr/0023-giver-message-visible-to-owner-immediately-not-spoiler-gated.md))

### Cluster D — Accessibility & browser support — ✅ Resolved (see §[3.16](#316-accessibility--browser-support), ADR-[024](docs/adr/0024-wcag-2-2-level-aa-is-the-accessibility-target.md)–[029](docs/adr/0029-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md))

The original decisions were confirmed, and a follow-up round of
counter-arguments raised afterward has now also been accepted and folded
in: WCAG target raised to 2.2 AA; the hold sheet and contribute flow use
the native `<dialog>` element rather than a hand-built focus trap; a
manual keyboard + screen-reader pass on the hold/contribute flows is
required pre-v1, and the axe severity ratchet has a concrete "zero
moderate violations before v1.0" checkpoint; the browser matrix is widened
to last 4 versions for the guest-facing surface (last 2 retained for the
owner dashboard) with a graceful-degradation requirement on the hold/
contribute flows specifically; and the i18n strings module is built on an
ICU MessageFormat-compatible library from the start, given multilingual
family guest lists are a plausible near-term case — full localization
delivery (translations, locale switcher) remains deferred under YAGNI.

### Cluster E — Ops, observability & performance — ✅ Resolved (see §[3.17](#317-performance--resource-budget)–[3.19](#319-observability-logging-metrics-tracing), §[3.7](#37-privacy) crypto-shredding addendum, ADR-[030](docs/adr/0030-performance-resource-targets-set-for-pi-class-hardware.md)–[034](docs/adr/0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md))

### Cluster F — Governance, docs & CI — ✅ Resolved (see §[3.20](#320-governance-licensing--release-process), §[3.21](#321-threat-model), ADR-[035](docs/adr/0035-threat-model-documented-in-docs-threat-model-md.md)–[043](docs/adr/0043-demo-instance-formally-deferred-not-rejected.md))

### Product questions

- **Anonymous contributions** — ✅ Resolved: name always required, visible
  only to the owner, never to other guests (see §[3.2](#32-names), ADR-[044](docs/adr/0044-anonymous-contributions-resolved-name-required-owner-only.md))
- **AGPL compliance for self-hosters who modify the code** — ✅ Resolved:
  `SOURCE_URL` env var + docs (see §[3.11](#311-ops), §[3.20](#320-governance-licensing--release-process), ADR-[045](docs/adr/0045-sourceurl-env-var-drives-agpl-3-0-network-use-compliance.md)) — raised during
  this round of questions, not part of the original two, but resolved
  alongside them
- **Whether owners can manually record offline (non-monetary)
  contributions** — ✅ Resolved: a `ManualGiftEntry` table outside the
  event-sourced ledger, no amount, modeled on the `thank_you_status`
  precedent, with an advisory-only item link and a combined
  "also mark as purchased" checkbox for the common single-item case
  (§[3.14](#314-owner-dashboard--editing-rules), ADR-[061](docs/adr/0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md))

### Audience-fit review — resolved this round

A review of the spec against its two stated audiences (guests, and
hobbyist self-hosters) surfaced ten gaps. Three are resolved:

- **Payment rails were US-only** while `currency` was per-list —
  ✅ Resolved (§[3.5](#35-payments), ADR-[046](docs/adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md)/[047](docs/adr/0047-contribution-snapshots-its-payment-method-at-pledge-time.md))
- **Post-authentication guest writes were unbounded**, and double-submits
  were unguarded — ✅ Resolved (§[3.3](#33-holds-single-items), §[3.4](#34-group-gifts--funds), §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px), ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)–[050](docs/adr/0050-hold-contribution-submits-carry-a-client-generated.md))
- **No timezone model existed** despite five features depending on one —
  ✅ Resolved (§[3.22](#322-time-timezones--display), ADR-[051](docs/adr/0051-civil-dates-and-instants-modelled-distinctly-via-per-list.md)/[052a](docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md))

### Cluster G — Guest & owner access continuity — ✅ Resolved (see §[3.1](#31-access--identity), §[3.14](#314-owner-dashboard--editing-rules), §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px), §[3.21](#321-threat-model), ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)/[053](docs/adr/0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)/[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)/[055](docs/adr/0055-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md))

- **Cross-device claim continuity**: resolved by restructuring the
  contribute flow so the `Contribution` row is only created at "I've sent
  it," eliminating the intermediate state a recovery secret would have
  protected. A same-session hint covers accidental resubmission; true
  cross-device/cross-session recovery for contributions remains an
  accepted gap, not solved. Hold recovery (`holdSecret`) is unchanged from
  v0.9.
- **Owner-token recovery when the operator is not the owner**: deferred
  (ADR-[053](docs/adr/0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)), not built. Current path is direct operator container/DB
  access.
- **Printable share artifact**: resolved (ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)/[055](docs/adr/0055-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md)) — the guest key
  moved to plaintext storage, enabling an on-demand "Get invite QR"
  action on the owner dashboard at any time, reusing existing local QR
  generation.

### Cluster H — Lifecycle, teardown & operator obligations — ✅ Resolved (see §[3.1](#31-access--identity), §[3.7](#37-privacy), §[3.14](#314-owner-dashboard--editing-rules), §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px), §[3.20](#320-governance-licensing--release-process), §[3.21](#321-threat-model), ADR-[056](docs/adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md)–[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md))

- **Post-`purgeAt` behaviour**: resolved (ADR-[056](docs/adr/0056-post-purgeat-lookups-return-the-same-generic-not-found.md)) — the generic
  not-found response is kept for both purged and never-existed slugs, to
  preserve ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md)'s enumeration guard, but gains an unconditional,
  non-distinguishing hint that links can expire. A full tombstone state
  was considered and rejected as reopening the enumeration question.
- **Instance teardown**: resolved (ADR-[057](docs/adr/0057-instance-teardown-addressed-as-a-documentation-checklist.md)) — a documentation checklist
  in the deployment guide (stop/remove container, delete volume,
  revoke/rotate `CREATE_SECRET`, tear down any tunnel/proxy), not an
  active app-level signal. No cross-list expiry-monitoring built, given
  the dominant single-list-per-instance deployment shape.
- **Operator as GDPR data controller**: resolved, and expanded well
  beyond the original docs-only framing once discussed further —
  - An owner-authored `privacyNotice` field (ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md)), rendered to guests
    when set, paired with a docs template. Not auto-generated.
  - Controller-awareness stated plainly on the creation acknowledgement
    screen (ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)), so it isn't gated behind an optional field.
  - A real right-to-erasure mechanism (ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)): PII moved out of the
    event stream into a redactable `GuestPii` side table, referenced by
    `piiRef`; owner-initiated redaction from reconciliation/thank-you.
    This reopens and partially supersedes ADR-[034](docs/adr/0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md)'s original
    compensating-event sketch, which turned out not to actually erase
    anything from the immutable event log.
  - Guest self-service data access and erasure (ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)): a per-session
    `GuestDataAccess` secret giving a guest a "what do you have on me" /
    "delete my personal information" view over all their own holds and
    contributions on a list, without going through the owner. A narrow,
    differently-justified reopening of ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)'s rejection of a
    contribution-side secret.
- **Cloudflare Tunnel in the reverse-proxy docs**: resolved — and
  subsequently promoted to the *recommended* deployment path (§[3.20](#320-governance-licensing--release-process)).
  The ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md) residual-risk callout originally attached to it (`?key=`
  landing in a third party's logs) no longer applies: ADR-[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md) moved the
  key into the URL fragment precisely because that caveat became
  load-bearing once this path became the default.

### Consistency pass — resolved

A full-document consistency pass, run after every cluster had closed. Its
findings were not open questions but latent contradictions — a requirement
depending on a field the domain model never declared, a threat row claiming
coverage the spec did not provide, a retention promise with no mechanism.
Recorded here because eight ADRs (062–069) came out of it, and without this
list they would be the only decisions in the document with no question trail
behind them.

Twenty-nine findings, all closed. Tiered A (nine), B (twelve), C (eight) by
severity at filing.

| Finding | Contradiction | Resolved by |
|---|---|---|
| A1 | `Wishlist` had no `title`/`description` despite three call sites depending on them | §[2](#2-domain-model), §[3.1](#31-access--identity), §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px) — fields added; no ADR, records what the spec already assumed |
| A2 | `ownerEmail` collected in §[3.1](#31-access--identity) but undeclared in §[2](#2-domain-model) and outside every PII mechanism | §[3.1](#31-access--identity) — field removed; amends **ADR-[053](docs/adr/0053-owner-token-recovery-deferred-direct-operator-access-is-the.md)** |
| A3 | Manual contribution edit/delete had no legal implementation under the ledger rules | **ADR-[062](docs/adr/0062-manual-contributions-are-voidable-not-editable.md)** |
| A4 | `privacyNotice` rendered pre-auth, contradicting §[3.1](#31-access--identity) and ADR-[016](docs/adr/0016-no-public-list-directory-lookups-fail-generically.md) | §[3.1](#31-access--identity), §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px) — surface split; amends **ADR-[058](docs/adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md)** |
| A5 | ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)/[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md) built the only legally-consequential mechanism and §[3.13](#313-testing) tested none of it | §[3.13](#313-testing) — tests specified (E76–E78); implements 059/060 |
| A6 | Hold duration called "configurable via env var" with no such var | §[3.3](#33-holds-single-items), §[3.11](#311-ops) — `HOLD_DURATION_DAYS`; amends **ADR-[002](docs/adr/0002-holds-are-3-day-extendable-once-operator-configurable.md)** |
| A7 | Purge window called configurable with no var and no stated default | §[3.7](#37-privacy), §[3.11](#311-ops) — `PURGE_AFTER_DAYS`, default 90 |
| A8 / A8c | Currency-blind contribution ceiling; `currency` unvalidated; minor-unit storage unjustified | **ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md)**, amends 049 |
| A9 | `TRUST_PROXY` boolean collapsed per-IP rate limiting in the recommended deployment | **ADR-[068](docs/adr/0068-client-ip-resolution-is-a-hop-count.md)** |
| B1–B3 | Editorial: stale cross-references and a mis-tagged ADR citation | §[3.1](#31-access--identity), header |
| B4 | `revealAfter` derived in §[2](#2-domain-model) but owner-settable in §[3.22](#322-time-timezones--display) | **ADR-[066](docs/adr/0066-revealafter-is-stored-not-derived.md)** |
| B5 | Nothing set `revealedAt`; lazy placement had an ordering hazard | Amends **ADR-[052a](docs/adr/0052a-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)** |
| B6 | 180-day session cap vs. ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md)'s "short session lifetime" mitigation claim | §[3.1](#31-access--identity) — cap dropped; amends **ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md)**, cites **064** |
| B7 | Owner-token URL handling unspecified; threat row overclaimed coverage | **ADR-[064](docs/adr/0064-the-owner-token-never-travels-in-a-url.md)** |
| B8 | Giver-email purge promised with no mechanism | **ADR-[065](docs/adr/0065-one-periodic-task-with-giver-email-purge-attached.md)** |
| B9 | JSON import restores redacted PII; §[3.7](#37-privacy) recommended whole-list export as SAR fulfilment | **ADR-[067](docs/adr/0067-erasure-across-backups-and-the-subject-access-routing-fix.md)** |
| B10 | Rebuild test covered one of three declared non-derived tables | §[3.13](#313-testing) — implements **008/059/061** |
| B11 | Security tests omitted escaping and URI-scheme injection; §[3.20](#320-governance-licensing--release-process) held a drifting duplicate list | §[3.13](#313-testing), §[3.20](#320-governance-licensing--release-process) — one enumerated list, one source |
| B12 | `GuestPii` per-record granularity undocumented; ADR-[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md) invited the wrong reading | Clarification appended to **ADR-[059](docs/adr/0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)/[060](docs/adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)** |
| — | Guest key transport, raised by A9's Tunnel-as-default consequence | **ADR-[069](docs/adr/0069-the-guest-key-travels-in-a-fragment.md)**, supersedes ADR-[022](docs/adr/0022-guest-key-travels-in-the-invitation-url-transport.md) transport |
| C1–C8 | Final editorial batch: `keyGen` mechanism, `GuestDataAccess.wishlistId` scoping, CSV redaction rendering, `Item` field mix-up, fund preset derivation, and the §[4](#4-adr-index) detail-block note | §[2](#2-domain-model), §[3.1](#31-access--identity), §[3.14](#314-owner-dashboard--editing-rules), §[3.15](#315-guest-ux--browse-hold-contribute-mobile-first-375px), §[4](#4-adr-index) |

Two consequences worth stating, since neither is visible from the table:

- **ADR numbering is spent through 069**, with nothing reserved. Any ADR
  arising later takes 070+, and must be re-verified against §[4](#4-adr-index) before use —
  this document has been bitten by a numbering collision before (see §[4](#4-adr-index)'s
  numbering note and the 052/052a entry).
- **Closing A5 means the erasure tests are specified, not run.** That
  distinction is the v1.0 gate below, not a formality.

### Carried-forward flags — decisions made, not derived

Recorded so they stay visible for reconsideration rather than hardening by
default:

- The **hard block** on creating a `group`/`fund` item when no payment
  method exists (§[3.14](#314-owner-dashboard--editing-rules)) stands. The softer warn-and-allow alternative —
  render the contribute flow with instructions only — remains rejected,
  not just open: a `custom`, `text`-only payment method already covers
  the offline/cash-only owner without weakening the block for everyone
  else (§[3.14](#314-owner-dashboard--editing-rules) doc note), so the apparent gap this flag originally
  recorded doesn't require a mechanism change.
- **`MAX_ACTIVE_HOLDS_PER_SESSION = 10`** is a reasonable estimate, not
  empirically derived; same status as the ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md) rate-limit numbers. A
  pre-v1 validation test is attached (§[3.13](#313-testing)) — this flag stays open until
  that test is run and the default confirmed or adjusted. The contribution
  ceiling half of this flag is **closed**: ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md) removed the money
  meaning from the absolute bound, so there is no longer a defensible-
  number question to validate, and the target-relative multiple scales
  with a figure the owner chose.
- **`sessionHash` is stored on holds and, as of this round, on guest
  contributions too** (`contributorSessionHash`, ADR-[052](docs/adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)) — powering the
  same-session "already sent" hint. This resolves the prior open flag
  about whether contributions should carry a session hash; the answer is
  yes, but scoped strictly to the same-session hint, not to any
  cross-session "these pledges came from one session" owner-facing view,
  which remains unbuilt.
- **Guest key is now stored in plaintext** (`key`, not `keyHash`,
  ADR-[054](docs/adr/0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)) — a change from the original one-way-hash design, made to
  support on-demand QR regeneration. Flagged here as a security-posture
  change worth revisiting if the project's threat tolerance shifts (e.g.
  if a future requirement demands protecting against DB-file theft
  specifically, which §[3.7](#37-privacy) currently places out of scope).

### Version & release gate

- **v0.10** is cut at the close of the consistency pass (§[5](#5-open-questions)) — every
  finding resolved, ADRs 062–069 written, and the document internally
  consistent.
- **v1.0 is reserved until the pre-v1 validation tests have actually
  run.** There are now three, not four: the rate-limit thresholds
  (ADR-[042](docs/adr/0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)), the hold cap (ADR-[048](docs/adr/0048-guest-sessions-capped-at-n-concurrent-active-holds-per-list.md)), and the redaction/erasure suite
  (§[3.13](#313-testing), finding A5). The contribution-ceiling test is retired by
  ADR-[063](docs/adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md), which removed the money meaning it would have validated.
- A5 is closed in the sense that its tests are now *specified*. It does
  not follow that they pass. ADR-[050](docs/adr/0050-hold-contribution-submits-carry-a-client-generated.md)'s detail block is explicit that
  upcaster discipline begins at the 1.0 tag, so tagging 1.0 freezes the
  `GuestPii`/`piiRef` schema — which is precisely the schema those tests
  exist to exercise. Running them before the tag is the point, not a
  formality.
