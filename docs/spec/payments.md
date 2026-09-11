# Payments


- Payment rails are **unverifiable programmatically** — the app never calls
  a payment API, never holds funds, and never confirms receipt. The owner
  reconciles manually. UI must be honest about this. *(ADR-[004](../adr/0004-pledged-vs-confirmed-states-payments-unverifiable-by-design.md))*
- Because nothing is verified, a "payment method" is display data, not an
  integration: a label, a destination handle, and a render strategy. It is
  therefore **per-list configuration, not a hardcoded enum**. *(ADR-[046](../adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md))*
- Two states: `pledged` (guest asserts) and `confirmed` (owner reconciled)
- Progress bar renders confirmed as solid, pledged as hatched/ghosted, with numbers stated plainly
- Guests see combined progress; owner sees the split plus a reconciliation view
- Amounts stored as integer minor units *(ADR-[063](../adr/0063-currency-validation-minor-unit-storage-and-the-ceiling.md))*

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
  path chosen for locale files in ADR-[029](../adr/0029-i18n-groundwork-is-intl-formatting-plus-icu-messageformat.md). The model is built now; the
  catalogue is not.
- **QR codes are always generated locally** — never via a third-party API.
- **`custom` is `text` (and `text`-derived QR) only.** It never produces a
  deep link. Owner-supplied strings are never rendered into an `href`;
  deep links exist solely for known `kind` values whose templates ship
  with the app, and rendered URLs are restricted to `https:` plus the
  known app schemes those templates declare. *(ADR-[046](../adr/0046-payment-methods-are-per-list-configuration-not-a-hardcoded.md), §[3.21](threat-model.md))*
- Payment method is **snapshotted onto the Contribution at pledge time**,
  a deliberate exception to the live-read rule in ADR-[018](../adr/0018-group-fund-targetminor-is-editable-and-read-live.md). *(ADR-[047](../adr/0047-contribution-snapshots-its-payment-method-at-pledge-time.md))*

### 3.6 Manual contributions

---

[← Back to spec index](README.md)
