# Data & persistence

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
  hidden in the reconciliation view. *(ADR-[060](../adr/0060-manual-contributions-are-voidable-not-editable.md))*
- `HoldExpired` is **derived, not emitted**
- Event payloads carry a version field `v` from day one
- **Streams are scoped per item**, matching the consistency boundary
- `UNIQUE (itemId, seq)` provides optimistic concurrency; losing writer retries against fresh state and re-evaluates the policy. Retry cap 3 with jitter.
- Global auto-increment `id` gives cross-stream ordering for list-level views
- **Each event row records the acting role** in an `actor` column
  (`guest` or `owner`, `NOT NULL` with a check constraint) beside
  `event_type` and `seq`: envelope metadata, never a payload field,
  derived from the credential that authorised the command and never
  from request input. *(ADR-[075](../adr/0075-ledger-events-record-the-acting-role.md))*
- **Soft delete = a `Voided` event**, not a nullable column
- **Projections are real tables**, written in the same transaction as the append — synchronous and strongly consistent, not eventually consistent
  - `item_state` (lastSeq, purchasedCount, pledgedMinor, confirmedMinor).
    Hold liveness is read from `holds` rows, never kept as a counter:
    under lazy expiry nothing is written when a hold expires, so a
    counter could not stay honest (holds-lifecycle D4).
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
  regardless of redaction. Per ADR-[032](../adr/0032-migrations-are-forward-only-rollback-restore-from-backup.md), this is a payload shape change;
  consistent with the precedent set in ADR-[044](../adr/0044-payment-methods-are-per-list-configuration-not-a-hardcoded.md)/[045](../adr/0045-contribution-snapshots-its-payment-method-at-pledge-time.md)/[048](../adr/0048-hold-contribution-submits-carry-a-client-generated.md), the project is
  pre-1.0 with no deployed instances, so the shape is amended in place
  rather than versioned/upcasted. *(ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md), amends ADR-[033](../adr/0033-crypto-shredding-deferred-whole-list-purge-covers-the-need.md))*
- **Idempotency is enforced via `UNIQUE (itemId, idempotencyKey)` on the
  `holds` and `contributions` projections**, written in the same
  transaction as the event append (per the synchronous-projection rule
  above). No separate idempotency table and no new lazy-expiry mechanism
  is introduced. The key is carried in the `ItemHeld`,
  `ContributionPledged`, and `ManualContributionRecorded` payloads so a
  `rebuildProjections` run reconstructs the constraint rather than
  dropping it. *(ADR-[048](../adr/0048-hold-contribution-submits-carry-a-client-generated.md))*
- **Audit table for CRUD metadata**: `(entityId, field, oldValue, newValue, changedAt)`. Purge is a `DELETE`.
- SQLite in WAL mode, single file on a mounted volume
- **Rate limiting is also stored in SQLite** — a `rate_limit_attempts` table, fixed-window, lazily expired the same way hold expiry is (never a cron sweep). No new service dependency introduced for this. See [threat model](threat-model-summary.md) for thresholds.
- DB-level check constraints as a backstop to application invariants

---

[← Back to spec index](README.md)
