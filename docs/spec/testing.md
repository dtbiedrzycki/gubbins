# Testing

- Unit tests with coverage reporting; high bar on the domain layer
- Integration tests against real SQLite, not mocks
- **Explicit concurrency test**: N parallel holds on a quantity-1 item; N parallel "cover the rest" clicks
- Projection rebuild test: fold events, compare to incrementally
  maintained state; verify all three non-derived tables survive a
  rebuild untouched — `thank_you_status`, `guest_pii`, and
  `manual_gift_entries` ([data & persistence](data-and-persistence.md)) — including that a redacted `GuestPii`
  row remains redacted and every `piiRef` still resolves afterwards. The
  two added here are where a mistake costs most: a rebuild that clears
  `guest_pii` orphans every `piiRef` in the event log, and one that
  clears `manual_gift_entries` loses owner-authored records with no
  ledger events to reconstruct them from.
- Playwright e2e for the guest flow, with `@axe-core/playwright` wired in (see [accessibility & browser support](accessibility-and-browser-support.md))
- Security tests as first-class cases:
  - SSRF on the metadata fetcher
  - Token and secret guessing across every bearer credential
  - IDOR between wishlists
  - **Timing side-channel on every secret comparison path** — owner
    token, hold secret, guest key, guest-data-access secret, and
    `CREATE_SECRET` — per ADR-[035](../adr/0035-constant-time-comparison-generalized-to-all-secret.md)'s generalization, not `CREATE_SECRET`
    alone. ADR-[052](../adr/0052-guest-key-storage-changed-from-one-way-hash-to-plaintext.md) made the guest key a plaintext compare, so its path
    is newly load-bearing.
  - **Output escaping across every free-text field**: list `title` and
    `description`, guest name and message, manual-gift giver name and
    description, payment-method `label`/`handle`/`instructions`,
    `privacyNotice`, and `PRIVACY_CONTACT`. [Threat model](threat-model-summary.md) claims escaping as the stored-XSS mitigation;
    this is what verifies it. The list is enumerated rather than
    described so a field added later without a test is visible as an
    omission.
  - **URI-scheme restriction** (ADR-[044](../adr/0044-payment-methods-are-per-list-configuration-not-a-hardcoded.md)): a `custom` payment method is
    never rendered into an `href`, and a `javascript:` or `data:` handle
    cannot escape the text/QR path. ADR-[044](../adr/0044-payment-methods-are-per-list-configuration-not-a-hardcoded.md)'s detail block states this
    closes a `javascript:`-URI XSS path against the app's own origin — a
    claim with no test behind it until now.
  - **Owner-token transport** (ADR-[062](../adr/0062-the-owner-token-never-travels-in-a-url.md)): no route accepts the owner
    token as a query or path parameter, and no owner-facing response
    embeds it in a link.
  - **Guest-key transport** (ADR-[067](../adr/0067-the-guest-key-travels-in-a-fragment.md)): no request to `/wishlists/{slug}` carries
    the key in a query string or path; the key-entry POST body is
    redacted in logs; key entry rejects a cross-origin POST.
  - Rate-limit threshold enforcement ([threat model](threat-model-summary.md))
- Backup/restore round-trip test: `VACUUM INTO` backup and JSON export, wipe, restore each, verify equivalence
  — and: a redacted `GuestPii` row round-trips as redacted through both
  backup methods; importing a pre-redaction export over a database
  holding a redacted row leaves the row redacted; and a redaction logs
  the backup-deletion warning with its delete-by date and no guest
  identifiers.
- Migration test: run every migration against a seeded copy of the prior schema version, in CI, to catch failures pre-release
- Load test against real Pi-class hardware to verify the [performance & resource budget](performance-and-resource-budget.md) performance/resource budgets — targets are budgets to be measured, not assumptions
- **Rate-limit false-positive test**: simulate many honest guests sharing a single IP (realistic at a physical event on venue wifi) against the per-IP thresholds in [threat model](threat-model-summary.md); adjust the per-IP threshold if the false-positive rate proves too aggressive, before v1. Numbers were set as reasonable defaults, not derived empirically — this test is how they get validated. *(ADR-[040](../adr/0040-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md))*
  Run the same simulation twice more. Once with the app behind a reverse
  proxy and `TRUSTED_PROXY_HOPS` left at 0, asserting the
  misconfiguration warning fires and the per-IP limiter is observably
  collapsed — a failure the venue-wifi scenario misses entirely, since it
  addresses the app directly. And once with several simulated guests
  behind one shared VPN egress address: distinct from venue wifi in that
  the guests are unrelated and dispersed, so a lockout penalises someone
  for strangers' behaviour. Separately, send rotating forged
  `X-Forwarded-For` values straight to the app from a public address with
  `TRUSTED_PROXY_HOPS` above 0, asserting the header is ignored, the
  per-IP limit still trips, and the warning fires. If either produces an unacceptable
  false-positive rate, the candidate remedy is converting guest-key-entry
  per-IP from a lockout to an added delay, matching the reasoning ADR-[040](../adr/0040-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)
  already applied to the per-slug aggregate. *(ADR-[040](../adr/0040-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md), ADR-[066](../adr/0066-client-ip-resolution-is-a-hop-count.md))*
- **Hold-cap validation test**: same evidentiary status as the rate-limit
  numbers above — `MAX_ACTIVE_HOLDS_PER_SESSION` (default 10) is a
  reasonable estimate, not empirically derived. Simulate a single
  guest/co-host legitimately holding many items at once (e.g. coordinating
  gift logistics for a large family) before v1, and adjust if honest use
  trips it. The contribution ceiling no longer needs this treatment: the
  target-relative multiple is currency-neutral, and the absolute bound is
  an arithmetic guard rather than a money threshold ([group gifts & funds](group-gifts-and-funds.md), ADR-[061](../adr/0061-currency-validation-minor-unit-storage-and-the-ceiling.md)).
- **Currency handling tests** (ADR-[061](../adr/0061-currency-validation-minor-unit-storage-and-the-ceiling.md)): amounts round-trip exactly through
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
  the in-transaction read ([backend architecture](backend-architecture.md)) and that no TOCTOU window exists
- Idempotency test: replaying an identical submit key against the same
  item returns the original hold/contribution rather than creating a
  second, and the constraint survives `rebuildProjections`
- **Manual-contribution correction test** (ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md)): correcting a manual
  entry's amount voids the original and records a replacement carrying
  the *original* `piiRef`; `item_state.confirmedMinor` reflects only the
  replacement; an existing `thank_you_status` row follows to the new
  contribution id rather than orphaning; redacting the live entry leaves
  no un-redacted name on the voided one; the voided row survives
  `rebuildProjections` as voided. Separately: a name/message edit on a
  manual entry emits no event, is rejected against a `source = guest`
  entry, and is rejected once `redactedAt` is set.
- **Redaction and erasure tests** (ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md), ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md)): after redacting a
  `GuestPii` row, verify every `piiRef` referencing it still resolves to
  a real row; `name`/`email`/`message` are null while the referencing
  hold or contribution's amount, item, status, and date are unchanged;
  `redactedAt` is set and no code path clears it; and the row renders as
  "[Redacted]" in the reconciliation view, the thank-you view, and the
  CSV export. Redaction succeeds regardless of `revealedAt` or the
  spoiler toggles ([privacy](privacy.md)). For guest-initiated erasure via
  `/wishlists/{slug}/my-data/{secret}`: the bulk action redacts every hold and
  contribution belonging to that session on that list and nothing
  belonging to any other session or list; a secret issued for one list
  does not resolve on another; and the `GuestDataAccess` row is created
  on a session's first hold or contribution rather than at session
  start, so a browsing-only session accumulates no secret. After a key
  rotation ([access & identity](access-identity.md), `keyGen`): a link issued before the rotation still
  resolves and returns exactly its own pre-rotation records; a link
  issued afterwards covers only post-rotation records; neither returns
  the other's; and no rotation revokes an already-issued link.
- **`piiRef` integrity assertion** (ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)): a structural test over the
  event-payload schemas asserting that no event type carries a `name`,
  `email`, or `message` field directly. This guards ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s central
  claim against silent regression as new event types are added — a
  behavioural test cannot catch a payload that simply starts carrying
  PII again. Runs in the same CI stage as the layer-boundary lint
  ([backend architecture](backend-architecture.md)), both being architecture constraints rather than behaviour.
- **Email retention test** (ADR-[063](../adr/0063-one-periodic-task-with-giver-email-purge-attached.md)): a `GuestPii` row past
  `expiresAt + 7 days` has `email` nulled while `name` and `message`
  survive; a row inside the window is untouched; a purchased or released
  hold ages out on the same clock as an expired one; the task is
  idempotent across repeated runs; and a redacted row is unaffected
  (already null).
- Coverage targets meaningfully lower on the front-end — chasing 90% on components produces markup assertions

---

[← Back to spec index](README.md)
