# Manual contributions

- `source: 'guest' | 'manual'` on Contribution
- Manual entries are `confirmed` at creation and bypass the overfunding policy
- Owner supplies the name
- **Manual entries are voidable, not editable, at the ledger level**, and
  are never hard-deleted — `ContributionVoided` is the deletion path, per
  [data & persistence](data-and-persistence.md)'s blanket soft-delete rule and the same reasoning ADR-[017](../adr/0017-items-with-ledger-history-are-archived-not-deleted.md) applied
  to items. Amount and the method snapshot live in the event payload and
  cannot be changed in place; correcting either is a void plus a fresh
  `ManualContributionRecorded`, surfaced to the owner as a single action
  ([owner dashboard & editing rules](owner-dashboard.md)). `source`, `pledgedAt`, and `confirmedAt` are immutable.
- **Name and message correct in place**, as a plain `UPDATE` on the
  entry's `GuestPii` row ([domain model](domain-model.md), ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)) with no ledger event — those
  fields were moved out of the event stream precisely so they could be
  mutated. Permitted only where the referencing contribution has
  `source = manual` (the owner is correcting their own record, not
  rewriting a guest's) and the row's `redactedAt IS NULL` (editing a
  redacted row would be an un-redact, which ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) forbids).
- Guest entries may be confirmed or voided but **not rewritten**; their
  `GuestPii` row is redactable but never editable. *(ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md))*
- Method is optional on manual entries: the owner may select a configured
  `PaymentMethod`, or leave it null (offline cash, or a rail the list never
  advertised). Null renders as "—" in the reconciliation view rather than
  being hidden.
- Source displayed in the reconciliation view

---

[← Back to spec index](README.md)
