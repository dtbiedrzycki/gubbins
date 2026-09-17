# Access & identity

- **Guest access** = slug (in URL) + key (entered once). Slug alone renders nothing.
- Key is human-readable and speakable (`warm-otter-42`), suitable for a printed invitation
- Key stored in plaintext, matching the existing treatment of `ownerToken`
  and hold `secret` — none of the system's bearer secrets are hashed.
  This is a deliberate change from the original design (which hashed only
  the guest key) made to support on-demand QR regeneration ([owner dashboard & editing rules](owner-dashboard.md),
  ADR-[052](../adr/0052-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)); it removes an inconsistency rather than introducing a new
  one, and is consistent with [privacy](privacy.md)'s existing stance that DB-file/backup
  theft is an out-of-scope, deployment-level concern rather than
  something the app defends against internally. Brute-force guessing is
  stopped by rate limiting and unguessable `TokenGenerator` output
  (ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md), ADR-[040](../adr/0040-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)), not by hashing.
- Successful entry sets a signed, httpOnly, list-scoped session cookie
- Rate limit key attempts per IP **and** per slug, with global lockout — see [threat model](threat-model-summary.md) for concrete thresholds
- Key gate page reveals nothing — not the list `title`, not the
  description, no claim counts, nothing identifying the owner. `title` is
  the only list-identifying string in the model, so withholding it is the
  whole of the rule ([domain model](domain-model.md)).
  The gate does carry a static, app-authored privacy statement — what a
  Gubbins instance collects, that it is deleted after the event, and
  that the operator is the data controller. It contains no owner-supplied
  content and renders identically on every failed and successful gate, so
  it adds no per-slug signal (ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md), ADR-[056](../adr/0056-privacy-notice-rendered-by-the-app-with-operator-contact.md)).
- **Owner access** = owner token alone; the key is not required, so key
  rotation cannot lock the owner out. The token is **never carried in a
  URL**. The owner pastes or types it into the homepage input already
  specified above, which smart-routes on it; the server validates and
  sets the signed, httpOnly, list-scoped, `Secure` owner-access cookie
  (ADR-[036](../adr/0036-session-and-owner-access-cookies-require-secure-https.md)), then routes to `/{slug}/manage`. There is no
  `?token=`-style link and no bookmarkable manage URL that carries the
  credential. *(ADR-[062](../adr/0062-the-owner-token-never-travels-in-a-url.md))*
- Key rotation invalidates guest sessions but preserves holds,
  purchases, and contributions. The mechanism is `keyGen` ([domain model](domain-model.md)): the
  counter is carried in the session cookie payload and incremented on
  rotation, so an existing cookie fails validation and the guest
  re-enters the new key. A re-entering guest receives a new session and
  therefore a new `sessionHash` and a new `GuestDataAccess` row — the
  same-session "you already sent this" hint ([access & identity](access-identity.md), ADR-[050](../adr/0050-contribution-amount-recorded-only-at-i-ve-sent-it.md)) does not
  survive rotation. Previously issued `/{slug}/my-data/{secret}` links
  do: they resolve by secret to the pre-rotation row, so a guest's
  subject-access and erasure route is never revoked by an owner rotating
  the key.
- **Known limitation, accepted:** a guest who acts both before and after
  a rotation ends up holding two data-access links, each covering only
  the records from its own session, and neither showing everything. This
  reintroduces at two links the fragmentation ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md) rejected
  per-record secrets to avoid. It is not fixable: after rotation the
  system genuinely cannot tell the two sessions belong to one person —
  `sessionHash` is the only identity available and it has changed — and
  merging them would require a durable guest identity the no-accounts
  principle rules out ([design principles](../../gubbins-spec.md#design-principles), ADR-[001](../adr/0001-no-accounts-slug-key-for-guests-owner-token-for-owners.md)). Bounded by rotation being
  infrequent, and by each link remaining independently valid for the
  records it covers. *(ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md))*
- Owner token rotatable; rotation preserves all claim history
- Creation flow includes an explicit **"save your owner token"**
  acknowledgement screen, presenting the owner token, the guest key, and
  the list URL, with a "Copy" affordance on each. Named for the token
  rather than a link because the token is the credential and no
  full-control link exists to save (ADR-[062](../adr/0062-the-owner-token-never-travels-in-a-url.md)).
- The "save your owner token" screen also states plainly that the owner is
  responsible for any guest names, emails, or messages collected through
  the list, with a link to the privacy guide ([governance, licensing & release](governance-licensing-and-release.md)) —
  controller-awareness at the one moment every owner is guaranteed to
  pass through, rather than left to an optional field they may never
  fill in. *(ADR-[056](../adr/0056-privacy-notice-rendered-by-the-app-with-operator-contact.md))*
- **No owner email is collected.** Automated owner-token recovery is
  deferred (ADR-[051](../adr/0051-owner-token-recovery-deferred-direct-operator-access-is-the.md)), so there is nothing for an address to do; storing
  one against a future feature would be collection without a purpose,
  which [privacy](privacy.md) rules out for guests and should equally rule out for owners.
  Today, recovery for a list whose owner is not the operator requires the
  operator to act directly (rotating the token via container/DB access) —
  the same trust boundary the threat model already assumes for the
  operator ([threat model](threat-model-summary.md)). If the deferred flow is later built, the field is
  added then, in settings.
- `X-Robots-Tag: noindex` and `robots.txt` on both guest and manage routes
- **Owner tokens are shared per list, not per-owner.** Co-owners (e.g., a couple) use the same token; there is no per-owner identity anywhere in the system, so N-tokens-per-list would add a token-management surface without any accountability benefit to attach it to. Compromise or a change in who should have access is handled by **rotation** (see above), not by issuing additional tokens. *(ADR-[015](../adr/0015-owner-tokens-are-shared-per-list-not-per-owner.md))*
- **List creation self-locks after the first list.** Creation is open with zero config until one list exists on the instance. After that, creation requires a valid invite secret (see [ops](ops.md)) unless the instance explicitly opts into always-open creation. This gives the dominant solo/one-event deployment a frictionless zero-config path while preventing an internet-reachable instance (guests need unauthenticated access, so the instance is inherently public-facing) from accepting unlimited anonymous list creation. *(ADR-[014](../adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md))*
- **No public list directory.** The instance homepage never enumerates existing lists, and failed slug/key/token lookups return an identical generic "not found" response regardless of which part was wrong — an enumeration guard consistent with the unguessable-link model. *(ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md))*
- **Fresh-instance / unauthenticated homepage** shows: a one-line description of the instance, a single input that accepts a list link, an owner token, or a slug+key pair and smart-routes to the right place, and a "Create a list" affordance whose visibility follows the creation-gating rule above. If creation is currently locked, the page says so plainly rather than hiding the option ambiguously.
- **All secret comparisons use constant-time comparison.** This applies uniformly to owner token verification, hold-secret verification, guest key verification, and `CREATE_SECRET` — stated once as a blanket rule rather than per-mechanism, so no comparison path is inadvertently implemented with `===`. *(ADR-[035](../adr/0035-constant-time-comparison-generalized-to-all-secret.md))*
- **Session and owner-access cookies require the `Secure` attribute.** HTTPS (direct or via reverse proxy) is a stated deployment requirement, not an implied one, given the credentials-in-cookies access model. *(ADR-[036](../adr/0036-session-and-owner-access-cookies-require-secure-https.md))*

**Guest entry via link (ADR-[067](../adr/0067-the-guest-key-travels-in-a-fragment.md)):**

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
  bar, not that entry. ADR-[067](../adr/0067-the-guest-key-travels-in-a-fragment.md) named this as unavoidable client-side and
  it remains so — this decision closes every server-side and intermediary
  leak and leaves exactly that one.
- **`pino` redact paths ([observability](observability.md)) must cover the POST body field**, not the
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
- Failed attempts return the same generic message, per ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md) and
  ADR-[054](../adr/0054-post-purgeat-lookups-return-the-same-generic-not-found.md), unchanged by this transport change.
- Guest session cookie lifetime: `purgeAt`. No independent cap — the
  cookie is scoped to one list which is deleted at that point, so it
  cannot usefully outlive the data it grants access to, and an earlier
  expiry falls hardest on guests least able to recover (a guest who no
  longer has the invitation cannot re-enter a key they never kept).
  Key rotation is the revocation mechanism (above), not expiry. This is
  deliberately unlike the owner-access cookie's 30-day rolling window
  (ADR-[062](../adr/0062-the-owner-token-never-travels-in-a-url.md)): the owner saved a token and re-entry costs one paste.
- Owner-access cookie lifetime: 30 days **rolling** (refreshed on each
  authenticated request) or `purgeAt`, whichever is sooner. Rolling
  rather than absolute so an owner who checks in periodically never
  re-enters, and only genuine month-long absence prompts it. Shorter
  than the guest session deliberately: the owner has saved one token and
  re-entry costs one paste, whereas re-keying a whole guest list does
  not. *(ADR-[062](../adr/0062-the-owner-token-never-travels-in-a-url.md))*
- The owner-access cookie also grants guest-view access to its own list,
  so an owner can preview what guests see without holding the guest key
  — consistent with "the key is not required" above.

**Same-session contribution hint (ADR-[050](../adr/0050-contribution-amount-recorded-only-at-i-ve-sent-it.md)).** A contribution stores the
hash of the guest session that created it (same pattern as `sessionHash`
on holds, [holds](holds.md)). If that same session later revisits the item, the UI
shows a non-authoritative "you already sent $X here" hint. This is a
same-device/same-session convenience only — it does not survive a session
expiring or a device switch, and no dedicated recovery secret or link is
issued for contributions (see [guest UX](guest-ux.md), ADR-[050](../adr/0050-contribution-amount-recorded-only-at-i-ve-sent-it.md)).

**Guest self-service data access (ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md)).** A guest can view and erase
everything they've personally shared on a list — all holds and
contributions tied to their session, joined through `piiRef` to
`GuestPii` — without going through the owner. Two entry points:

- **Live session**: `/{slug}/my-data`, using the existing session cookie,
  no secret in the URL. Same-device, same-session, no extra step.
- **Durable link**: `/{slug}/my-data/{secret}`, resolving via
  `GuestDataAccess.sessionHash` — covers a lost session or a different
  device. Shown once, with a "Copy link" affordance, on both the hold
  confirmation screen ([holds](holds.md), [guest UX](guest-ux.md)) and the contribution confirmation
  screen ([guest UX](guest-ux.md)), the same treatment already given to the hold-secret
  link.

The page lists every hold/contribution matching the session, with the
attached `GuestPii` (name/email/message) and what it's attached to
(item, amount, date). One primary action, **"Delete my personal
information"** — a single bulk call into the same redaction mechanism
ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) built for the owner side, invoked by the guest instead of the
owner. The label is deliberately scoped to identity, not the records
themselves: amount/item/status/date on the ledger remain and are
unaffected by this action, only name/email/message are stripped — the
UI should not imply the hold or contribution itself disappears when only
the personal-information fields are being redacted.

This is a narrow, differently-justified reopening of ADR-[050](../adr/0050-contribution-amount-recorded-only-at-i-ve-sent-it.md)'s rejection
of a contribution-side secret: ADR-[050](../adr/0050-contribution-amount-recorded-only-at-i-ve-sent-it.md) rejected a secret for *pledge
recovery* (nothing left to recover once amount entry moved to "I've sent
it"); this secret grants access to `GuestPii` data that already exists
once a contribution is confirmed — a subject-access/erasure right, not a
recovery convenience, and unrelated to how the contribution flow is
shaped.

---

[← Back to spec index](README.md)
