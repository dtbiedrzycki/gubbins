# Guest UX — browse, hold, contribute (mobile-first, 375px)

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
  the static app-authored statement ([access & identity](access-identity.md)), which renders unconditionally
  whether or not the slug exists. *(ADR-[058](../adr/0058-owner-configurable-privacynotice-field-shown-only-when-set.md))*

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
  per the capability-flag rule in [ops](ops.md)), optional message to the owner
  (≤300 chars), duration stated plainly ("Held for you for 3 days").
  Primary CTA: "Confirm hold."
- Confirmation screen: **"Mark as purchased"** is the primary action (per
  [holds](holds.md)). The private hold link (`/{slug}/hold/{holdSecret}`) is shown
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
  ([payments](payments.md), ADR-[063](../adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md)) at three round magnitudes, plus custom,
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
  surfaces the same guest self-service data link ([access & identity](access-identity.md), ADR-[060](../adr/0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)) the hold
  confirmation screen shows — the guest's one durable way back into "what
  do you have on me," regardless of which flow created it.
- No pre-payment draft state exists server-side — closing the tab before
  this step leaves nothing to recover; the guest simply redoes the
  (client-only) selection. This is why no dedicated contribution recovery
  secret is issued (ADR-[052](../adr/0052-contribution-amount-recorded-only-at-i-ve-sent-it.md)) — only the same-session hint ([access & identity](access-identity.md)) helps
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
  where the guest can only recover the second hold's secret. *(ADR-[050](../adr/0050-hold-contribution-submits-carry-a-client-generated.md))*

**Message from giver to owner**
- Optional free-text field, ≤300 chars, on both the hold sheet and the
  contribute flow. Escaped on output, same treatment as names.
- Visible to the owner **immediately**, regardless of
  `ownerSeesClaimStatus`, `ownerSeesClaimerIdentity`, or `revealAfter` —
  treated as a personal note, not claim-status information that spoiler
  settings are meant to protect. *(ADR-[023](../adr/0023-giver-message-visible-to-owner-immediately-not-spoiler-gated.md))*

---

[← Back to spec index](README.md)
