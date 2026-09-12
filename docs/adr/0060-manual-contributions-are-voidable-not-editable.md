# 0060. Manual contributions are voidable, not editable

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

[Manual contributions](../spec/manual-contributions.md) granted the
owner edit and delete on manual contributions in a single sentence, and
[owner dashboard](../spec/owner-dashboard.md) repeated it in the
reconciliation view, but neither operation had a legal implementation. A
manual contribution is a ledger event (`ManualContributionRecorded`);
[data & persistence](../spec/data-and-persistence.md) states soft
delete is a `Voided` event rather than a nullable column, and
ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)
rejected payload mutation outright as invalidating the immutability
assumption every event-sourcing decision from
[data & persistence](../spec/data-and-persistence.md) onward rests on.
The affordance was asserted, never designed.

## Decision

We will make manual contributions voidable, not editable: amount and
method snapshot live in the event payload and are corrected by
void-plus-re-record (reusing `ContributionVoided`, no new event type),
while name and message correct in place via a plain `GuestPii` UPDATE
with no ledger event. Hard delete becomes void. The dashboard surfaces
correction as one owner action reusing `piiRef` and carrying
`thank_you_status` across. `ManualGiftEntry`
(ADR-[059](./0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md))
keeps genuine edit/delete, since it sits outside the ledger.

## Alternatives considered

- **A `ManualContributionAmended` compensating event** — rejected: it is
  legitimate event sourcing and does not touch
  ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s
  immutability line, but it buys a new event type, new fold logic, and
  permanent upcaster surface
  ([backup, restore & upgrade](../spec/backup-restore-and-upgrade.md))
  for a case existing machinery handles — the same trade declined in
  ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md),
  ADR-[033](./0033-crypto-shredding-deferred-whole-list-purge-covers-the-need.md),
  ADR-[051](./0051-owner-token-recovery-deferred-direct-operator-access-is-the.md),
  and ADR-[055](./0055-instance-teardown-addressed-as-a-documentation-checklist.md),
  and the same reasoning
  ADR-[048](./0048-hold-contribution-submits-carry-a-client-generated.md)
  used to reuse an existing uniqueness constraint rather than add an
  idempotency table.
- **A separate `ManualContributionVoided` event type** — rejected:
  creation differs meaningfully by source, voiding does not, and the
  projection already knows the source from the original row.
- **Hard delete** — rejected without a close second: ADR-[017](./0017-items-with-ledger-history-are-archived-not-deleted.md)
  settled the equivalent question for items (archived, not deleted), and
  [data & persistence](../spec/data-and-persistence.md)'s soft-delete
  rule is written as a blanket, not a default. The strongest case for
  real deletion — an owner clearing a test entry made during setup — is
  covered adequately by void.
- **A fresh row plus a `supersedes` payload link and a cascading
  redaction rule**, instead of reusing the predecessor's `piiRef` —
  rejected: it reconstructs, with three moving parts, exactly the
  behaviour reuse gives directly. `GuestPii` row reuse is constrained to
  supersession chains and nowhere else
  ([domain model](../spec/domain-model.md)), since shared rows across
  unrelated records would break redaction scoping.

## Consequences

- Void-plus-re-record mints a new contribution id, which would orphan
  any `thank_you_status` row keyed to the old one; the dashboard action
  re-points it as part of the same one-click operation.
- The replacement reuses its predecessor's `piiRef` rather than copying
  to a fresh row, because the two entries are the same gift from the
  same person recorded twice — a redaction reaching one and not the
  other would leave an un-redacted name sitting on a row hidden behind
  the voided-rows toggle, an erasure failure rather than a tidiness
  question.
- The accepted cost is reconciliation clutter: a corrected entry is two
  rows, not one, mitigated by hiding voided rows behind a toggle. This
  is not treated as pure noise — manual entries are the one place in the
  system where the owner asserts money exists with no guest-side
  corroboration, so an untraceable amount edit is precisely where a
  later reconciliation dispute would land, and the audit trail is worth
  the row.
- **This resolution breaks a cross-reference.**
  ADR-[059](./0059-offline-non-monetary-gifts-recorded-via-manualgiftentry.md)
  justified `ManualGiftEntry`'s edit/delete affordance by analogy to
  [manual contributions](../spec/manual-contributions.md)'s old,
  unqualified edit/delete grant on manual contributions. That precedent
  no longer holds now that manual contributions are voidable, not
  editable. The affordance itself remains correct on its own footing,
  independent of that broken precedent: `ManualGiftEntry` sits outside
  the event stream, so there is no payload to contradict and nothing to
  void. [Owner dashboard](../spec/owner-dashboard.md) now states this
  contrast directly, so a future reader sees a principled distinction
  between two "manual" things rather than drift. (ADR-059 itself is not
  revised by this — it was written using this same current information.)
