# 0062. Manual contributions are voidable, not editable

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Manual contributions are voidable, not editable: amount and method snapshot live in the event payload and are corrected by void-plus-re-record (reusing `ContributionVoided`, no new event type), while name and message correct in place via a plain `GuestPii` UPDATE with no ledger event. Hard delete becomes void. The dashboard surfaces correction as one owner action reusing `piiRef` and carrying `thank_you_status` across. `ManualGiftEntry` keeps genuine edit/delete, since it sits outside the ledger

## Detail

**ADR-062 detail:** §[3.6](../spec/manual-contributions.md) granted the owner edit and delete on manual
contributions in a single sentence, and §[3.14](../spec/owner-dashboard.md) repeated it in the
reconciliation view, but neither operation had a legal implementation. A
manual contribution is a ledger event (`ManualContributionRecorded`);
§[3.8](../spec/data-and-persistence.md) states soft delete is a `Voided` event rather than a nullable
column, and ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) rejected payload mutation outright as invalidating
the immutability assumption every event-sourcing decision from §[3.8](../spec/data-and-persistence.md)
onward rests on. The affordance was asserted, never designed.

Resolving it began with noticing that "edit a manual contribution" is
not one operation. After ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) moved names and messages into the
mutable `GuestPii` side table, the field an owner is most likely to
correct — a name recorded as "Aunt Sue" that needs to read "Susan
Mitchell" before the thank-you export — is no longer in the event
payload at all, and correcting it is an ordinary `UPDATE` on a table
ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) already sanctions one kind of write against. That leaves only
amount and the method snapshot genuinely requiring ledger machinery, a
residue small enough that void-plus-re-record covers it with mechanisms
that already exist.

A `ManualContributionAmended` compensating event was the considered
alternative. It is legitimate event sourcing and does not touch
ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)'s immutability line, but it buys a new event type, new fold
logic, and permanent upcaster surface (§[3.18](../spec/backup-restore-and-upgrade.md)) for a case existing
machinery handles — the same trade declined in ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md), ADR-[034](./0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md),
ADR-[053](./0053-owner-token-recovery-deferred-direct-operator-access-is-the.md), and ADR-[057](./0057-instance-teardown-addressed-as-a-documentation-checklist.md), and the same reasoning ADR-[050](./0050-hold-contribution-submits-carry-a-client-generated.md) used to reuse an
existing uniqueness constraint rather than add an idempotency table. A
separate `ManualContributionVoided` type was likewise rejected:
creation differs meaningfully by source, voiding does not, and the
projection already knows the source from the original row.

Hard delete was rejected without a close second. ADR-[017](./0017-items-with-ledger-history-are-archived-not-deleted.md) settled the
equivalent question for items — anything with ledger history is
archived, not deleted — and §[3.8](../spec/data-and-persistence.md)'s soft-delete rule is written as a
blanket, not a default. The strongest case for real deletion is an
owner clearing a test entry made during setup, which void covers
adequately.

Two knock-ons shaped the dashboard action rather than the domain model.
Void-plus-re-record mints a new contribution id, which would orphan any
`thank_you_status` row keyed to the old one. And the replacement needs a
`piiRef`: the correction reuses its predecessor's rather than copying to
a fresh row, because the two entries are the same gift from the same
person recorded twice, so a redaction that reached one and not the other
would leave an un-redacted name sitting on a row hidden behind the
voided-rows toggle — an erasure failure, not a tidiness question. A
fresh row plus a `supersedes` payload link and a cascading-redaction
rule was considered and rejected: it reconstructs, with three moving
parts, exactly the behaviour reuse gives directly. Reuse is constrained
to supersession chains and nowhere else (§[2](../spec/domain-model.md)), since `GuestPii` rows
shared across unrelated records would break redaction scoping. Rather
than merge mechanisms to absorb any of this, the "correct" control
fires three writes as one owner action — void, re-record reusing
`piiRef`, re-point `thank_you_status` — the pattern ADR-[061](./0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md) used for
the combined "also mark as purchased" checkbox: one click, several
independent writes, no coupling at the domain level.

The accepted cost is reconciliation clutter: a corrected entry is two
rows, not one, mitigated by hiding voided rows behind a toggle. This is
not treated as pure noise — manual entries are the one place in the
system where the owner asserts money exists with no guest-side
corroboration, so an untraceable amount edit is precisely where a later
reconciliation dispute would land, and the audit trail is worth the row.

The change also breaks a cross-reference: ADR-[061](./0061-offline-non-monetary-gifts-recorded-via-manualgiftentry.md) justified
`ManualGiftEntry`'s edit/delete affordance by citing §[3.6](../spec/manual-contributions.md)'s as
precedent. That precedent no longer exists, but the affordance remains
correct on its own footing — `ManualGiftEntry` sits outside the event
stream, so there is no payload to contradict and nothing to void. §[3.14](../spec/owner-dashboard.md)
now states this directly and names the contrast, so a future reader sees
a principled distinction between two "manual" things rather than drift.
