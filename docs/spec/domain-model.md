# Domain Model

```
Wishlist
  slug                    unguessable, in URL
  title                   required, ≤120 chars, escaped on output.
                          Identifies the list to guests after key entry,
                          on the owner dashboard, and in reminder email
                          subjects. Never rendered pre-authentication
                          ([access & identity](access-identity.md)).
  description             optional free text, ≤2000 chars, escaped on
                          output. Owner-authored; the sanctioned place
                          for shipping details ([privacy](privacy.md)). Guest-visible
                          after key entry only.
  ownerToken               unguessable, grants full control, rotatable
  key                      guest key, stored in plaintext — consistent
                           with `ownerToken` and hold `secret`, neither
                           of which is hashed either. Human-readable and
                           speakable. See [access & identity](access-identity.md), ADR-[052](../adr/0052-guest-key-storage-changed-from-one-way-hash-to-plaintext.md).
  keyGen                  integer, starts at 1, incremented on every key
                          rotation. Carried in the guest session cookie
                          payload; a cookie bearing a stale keyGen is
                          rejected. This is the mechanism behind "key
                          rotation invalidates guest sessions" ([access & identity](access-identity.md)).
  currency                ISO 4217 alpha-3 code, single per list; all
                          amounts inherit. Validated at write time;
                          immutable once any priced item exists. See
                          [payments](payments.md), ADR-[061](../adr/0061-currency-validation-minor-unit-storage-and-the-ceiling.md).
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
                          visible rather than silent. See [time, timezones & display](time-and-timezones.md),
                          ADR-[064](../adr/0064-revealafter-is-stored-not-derived.md).
  revealedAt              nullable instant; set lazily in owner-request
                          middleware on the first authenticated owner
                          request where revealedAt IS NULL AND
                          now >= revealAfter — before routing, so a
                          settings edit in that same request cannot
                          outrun it. One-way, never cleared. No periodic
                          task is involved (ADR-[063](../adr/0063-one-periodic-task-with-giver-email-purge-attached.md)).
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
                          when null. See [privacy](privacy.md), ADR-[056](../adr/0056-owner-configurable-privacynotice-field-shown-only-when-set.md).

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
                 — see [data & persistence](data-and-persistence.md), ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))
  Purchase       single only — terminal
  Contribution   group | fund — amount, piiRef → GuestPii.id,
                 method: { kind, label, handle } | null  ← snapshotted
                   at pledge time; null permitted only when
                   source = manual
                 contributorSessionHash (guest source only, null for
                   manual) — powers the same-session "you already sent
                   this" hint; not a recovery credential ([access & identity](access-identity.md), ADR-[050](../adr/0050-contribution-amount-recorded-only-at-i-ve-sent-it.md))
                 pledgedAt, confirmedAt?, source: guest | manual,
                 idempotencyKey
                 (contributorName, message live in GuestPii, not here
                 — see [data & persistence](data-and-persistence.md), ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))

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
                           contributorName ([names](names.md))
  description              required, ≤300 chars, escaped on output —
                           same cap as the giver→owner message field
                           ([guest UX](guest-ux.md))
  recordedAt                timestamp, set at creation
  See [owner dashboard & editing rules](owner-dashboard.md), ADR-[059](../adr/0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md).

GuestPii (plain mutable table, outside event stream — same category as
          ThankYouStatus and the audit table: not derived from events,
          not folded, survives rebuildProjections untouched)
  id
  name                    nullable — null once redacted
  email                   nullable — hold-only, and never shown to the
                          owner; its sole consumer is the expiry reminder
                          ([holds](holds.md)). Nulled by the periodic task once
                          now > the hold's expiresAt + 7 days, whether
                          the hold expired, was released, or was
                          purchased. See [privacy](privacy.md), ADR-[063](../adr/0063-one-periodic-task-with-giver-email-purge-attached.md).
  message                 nullable — optional giver→owner note
  redactedAt              nullable timestamp; set once, one-way — no
                           un-redact action exists
  createdAt
  See [privacy](privacy.md), [data & persistence](data-and-persistence.md), ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md).

GuestDataAccess (plain table, not event-sourced — same category as
                  GuestPii, ThankYouStatus, audit table)
  wishlistId               the list this secret is scoped to
  sessionHash              hash of the guest session cookie value — same
                           derivation as Hold.sessionHash /
                           Contribution.contributorSessionHash
  secret                   plaintext, unguessable, TokenGenerator-issued
                           — consistent with the plaintext-bearer-secret
                           model (ADR-[052](../adr/0052-guest-key-storage-changed-from-one-way-hash-to-plaintext.md))
  createdAt
  UNIQUE (wishlistId, sessionHash)
  Created lazily on a session's first hold or contribution on a list.
  See [access & identity](access-identity.md), ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md).
```

### Invariants

- `activeHolds + purchased ≤ quantity` (single items)
- Contribution sum vs. `targetMinor` governed by `allowOverfunding`; overflow stays assigned to the same item
- Item type immutable once any hold or contribution exists
- Group items are quantity 1; their invariant is monetary, not count-based
- Every hold and contribution's `GuestPii` row carries a non-empty `name`
  **at creation**. A subsequent redaction ([privacy](privacy.md), ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)) is the one
  sanctioned way this can become null later — a deliberate state
  transition, not a violation of the creation-time requirement
- A `GuestDataAccess` row is created lazily on a session's **first** hold
  or contribution on a list, not at session start; every later hold or
  contribution from the same session reuses the existing row, so the
  secret is constant across everything one guest session does on one
  list ([access & identity](access-identity.md), ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md))
- A `GuestPii` row is referenced by exactly one hold or contribution,
  with one exception: a manual contribution corrected via void-and-
  re-record ([manual contributions](manual-contributions.md), ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md)) reuses its predecessor's `piiRef`, so a
  supersession chain shares one row. Sharing is legal **only** along
  such a chain — `GuestPii` rows are never deduplicated by name,
  session, or any other value, since redaction is scoped to the row and
  a row shared across unrelated records would let one erasure silently
  strip identity from a gift it was never meant to touch. See ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)
  for why the table is per-record rather than per-guest. *(ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md))*
- A `GuestPii` row's `name`/`message` may be edited in place only where
  the referencing contribution has `source = manual` and the row's
  `redactedAt IS NULL`. Guest-authored rows are redactable but never
  editable; a redacted row is neither. *(ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md))*
- A list must have at least one `PaymentMethod` before a `group` or `fund`
  item can be created; the last remaining method cannot be removed while
  any non-archived `group`/`fund` item exists
- Guest contributions carry a non-null method snapshot; manual
  contributions may carry null (offline cash, unknown rail)
- A guest session may hold at most `MAX_ACTIVE_HOLDS_PER_SESSION` items
  concurrently across the list. Purchased and released/expired holds do
  not count toward the cap
- Guest contribution amount must be > 0 and ≤ the sanity ceiling ([group gifts & funds](group-gifts-and-funds.md));
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
  item-type immutability (ADR-[013](../adr/0013-item-type-immutable-after-first-claim.md)). *(ADR-[061](../adr/0061-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- All amounts crossing into the domain are integer minor units. Major-unit
  parsing and formatting happen in presentation only, using the currency's
  exponent — the same boundary rule [time, timezones & display](time-and-timezones.md) applies to civil dates, and for
  the same reason: a representation that can be implied by omission gets
  implied wrongly. *(ADR-[061](../adr/0061-currency-validation-minor-unit-storage-and-the-ceiling.md))*
- `revealAfter < purgeAt`, compared as resolved instants, not civil dates
- Once `revealedAt` is set it is never cleared, and owner visibility never
  reverts, regardless of subsequent `timezone` or `eventDate` edits
- `PURGE_AFTER_DAYS` must be ≥ 1. At 0, `purgeAt` resolves to the same
  instant as the default `revealAfter`, violating `revealAfter < purgeAt`
  above.
- `title` and `description` are never rendered on any pre-authentication
  surface — the key gate, the generic not-found response (ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md),
  ADR-[054](../adr/0054-post-purgeat-lookups-return-the-same-generic-not-found.md)), or the instance homepage ([access & identity](access-identity.md)). There is no separate owner
  or event name field; `title` is the only list-identifying string, so
  this single rule is what keeps the key gate silent.
  The same applies to `privacyNotice` ([privacy](privacy.md), ADR-[056](../adr/0056-owner-configurable-privacynotice-field-shown-only-when-set.md)), which by
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
  taken via the existing "mark as purchased directly" (single, [holds](holds.md)) or
  a manual `Contribution` (group/fund, [manual contributions](manual-contributions.md)) — both of which are ledger
  events. Linking a `ManualGiftEntry` to an already-available item does
  not hide it from guests; the owner must also use one of those paths if
  that's the intent (the dashboard offers this as a single combined
  action for the single-item case — see [owner dashboard & editing rules](owner-dashboard.md))

---

[← Back to spec index](README.md)
