# Owner dashboard & editing rules

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
  already seen. *(ADR-[020](../adr/0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md), ADR-[070](../adr/0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md))*
- **Payment methods**: managed from list settings — add, edit, reorder,
  remove. Editing a method's label or handle does **not** rewrite existing
  contributions, which retain their snapshot (ADR-[045](../adr/0045-contribution-snapshots-its-payment-method-at-pledge-time.md)); the reconciliation
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
  block ([owner dashboard & editing rules](owner-dashboard.md), carried-forward flag) and manual contributions/
  `ManualGiftEntry` ([manual contributions](manual-contributions.md), ADR-[059](../adr/0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)) both supporting a null/no-online-rail
  path, without weakening the block itself.
- **Privacy notice**: free-text field (≤1000 chars) in list settings,
  same escaping treatment as names/messages. Empty by default. A short
  inline hint links to the docs template ([governance, licensing & release](governance-licensing-and-release.md)) rather than pre-filling
  it in the field itself, so the owner makes an active choice about the
  content rather than shipping unedited placeholder text to guests.
  *(ADR-[056](../adr/0056-owner-configurable-privacynotice-field-shown-only-when-set.md))*
- **Hold release**: the owner may release any active hold from the
  dashboard (see [holds](holds.md)), emitting `HoldReleased`. Confirming dialog states
  the holder's name where spoiler settings permit it to be shown, and a
  neutral "release this hold" otherwise.
- **Timezone / event date changes**: editing either re-derives `purgeAt`
  rather than rewriting a stored instant, and a change that would move
  `purgeAt` into the past is blocked. `revealAfter` is **not** re-derived
  — it is a stored instant (ADR-[064](../adr/0064-revealafter-is-stored-not-derived.md)), so an edit leaves it where the
  owner put it; the screen shows it re-rendered in the new zone, since
  the moment is unchanged but its local reading is not. Editing
  `revealAfter` itself is a separate, explicit control on the same
  screen. If `revealedAt` is already set, the dialog states plainly that
  claim status remains visible and will not be re-hidden. *(ADR-[070](../adr/0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md),
  ADR-[064](../adr/0064-revealafter-is-stored-not-derived.md))*
- **Approaching-purge notice**: once `purgeAt` is within 14 days, the
  dashboard shows a persistent banner stating the date in the list
  timezone ([time, timezones & display](time-and-timezones.md)) and linking the CSV export (above). Purge is silent
  and irreversible, and SMTP is optional ([ops](ops.md)) so no email can be
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
  purchased" checkbox below (ADR-[059](../adr/0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)), with no coupling introduced at
  the domain level. Name and message corrections are a separate,
  lighter in-place edit that emits no event at all ([manual contributions](manual-contributions.md)). Voided rows
  are hidden by default behind a "show voided" toggle. *(ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md))*
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
  **not** the treatment manual *contributions* receive ([manual contributions](manual-contributions.md), ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md)),
  which are ledger events and therefore voidable rather than editable —
  the two differ because one is on the ledger and one is not, not by
  oversight.
  Deletion doubles as this entity's erasure path — unlike `Contribution`/
  `Hold`, nothing in the event log references a `ManualGiftEntry` via
  `piiRef`, so full deletion carries no dangling-reference risk the way
  it would for ledger-linked PII ([privacy](privacy.md), ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)).
  **Combined action for the common case**: when the linked item is a
  still-available `single`, the form shows a checkbox — "Also mark this
  item as purchased" — checked by default. Confirming with it checked
  fires both the existing `ItemPurchased` event ([holds](holds.md)) and creates the
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
  is this entity's erasure path (ADR-[059](../adr/0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)), whereas ledger-linked PII must
  be redacted in place to keep every reference resolving (ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)).
  *(ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))*
- **Bulk add**: newline-separated URLs, each run through the existing
  SSRF-guarded metadata fetcher; failed fetches still create the item with
  blank metadata.
- **Reorder**: drag-and-drop over existing `sortOrder`; sparse increments to
  avoid full-table rewrites. Keyboard-operable move-up/move-down controls
  are provided alongside the drag handle (see [accessibility & browser support](accessibility-and-browser-support.md)) — a presentation-layer
  addition, no change to the underlying `sortOrder` mechanism.
- **Duplicate detection**: advisory only (normalized URL match warns on add);
  no DB constraint, no hard block.
- **Guest invite artifact**: an owner-authenticated "Get invite QR" action,
  available at any time, builds the keyed link (`/{slug}#key={key}`, ADR-[067](../adr/0067-the-guest-key-travels-in-a-fragment.md)) from
  the plaintext key already on file and renders it as a locally generated
  SVG QR, alongside the plain-text link and bare key. No third-party
  service — reuses the existing local QR generation from [payments](payments.md). Because the
  key is plaintext, this needs no decryption step and no special-cased
  availability window; rotating the key immediately invalidates any
  previously generated/printed cards, as the old key stops working.
  *(ADR-[052](../adr/0052-guest-key-storage-changed-from-one-way-hash-to-plaintext.md), ADR-[053](../adr/0053-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md))*

---

[← Back to spec index](README.md)
