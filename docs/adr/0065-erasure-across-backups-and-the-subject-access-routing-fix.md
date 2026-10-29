# 0065. Erasure across backups, and the subject-access routing fix

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

[Privacy](../spec/privacy.md) asserted erasure was one-way while
[ops](../spec/ops.md) offered JSON export/import as full logical
backup, and the two were never reconciled: a guest erases, the operator
restores a snapshot from the day before, the name returns. This is not
unique to this project — every backup system has it — but the spec
claimed an unqualified guarantee, which is worse than claiming a
qualified one. This decision reaffirms
ADR-[033](./0033-crypto-shredding-deferred-whole-list-purge-covers-the-need.md)'s
crypto-shredding deferral rather than reopening it: crypto-shredding is
the one technique that would genuinely solve the backup case, so it was
re-examined here specifically to confirm ADR-033's two rejected
key-store placements still fail for this project and its deferral
trigger still holds — not to relitigate the deferral itself. Separately,
the same review found that [privacy](../spec/privacy.md) recommended
JSON export as satisfying "most subject-access/portability requests,"
but the export is a whole-list dump, so handing it to a requesting
guest would disclose every other guest's name, email, and message.

## Decision

We will make erasure immediate in the live database and time-bounded in
backups: JSON export carries `guest_pii` with `redactedAt`, import lets
redaction win on conflict, and the remaining obligation is procedural —
hold pre-redaction backups beyond use pending rotation, re-apply
redaction after any restore, bounded by a stated backup retention
window never exceeding `PURGE_AFTER_DAYS`. Because that obligation falls
on the operator, the app surfaces it when it arises: each redaction logs
a warning that older backups hold the erased data and must be deleted by
a stated date, and the quickstart and backup guide state the window up
front. Separately, we will route
guest subject-access requests to
ADR-[058](./0058-guest-self-service-data-access-erasure-via-guestdataaccess.md)'s
self-service view at `/wishlists/{slug}/my-data`, never to JSON export.

## Alternatives considered

- **Instruct operators to delete backups predating an erasure
  request** — rejected: this was the first resolution drafted, but it is
  a blunt instruction nobody follows, and it is not how the problem is
  actually handled in established practice.
- **A redaction journal surviving restore and re-applying itself** —
  rejected: it only works if the journal lives outside the database
  being restored, meaning a second store, a second retention question,
  and a file that is itself a record of who exercised erasure.
- **Crypto-shredding with keys in a separate file on the volume**, so
  backups could outlive the window harmlessly — rejected: it moves the
  retention duty onto the key file and its copies rather than removing
  it, a whole-volume backup silently defeats it, and a lost key file
  loses every guest's personal data on restore.
- **Personal-data-free backups for long-term retention** — deferred:
  restoring one loses the names and messages the owner's thank-you view
  depends on.
- **Continue recommending JSON export for subject-access/portability
  requests** — rejected: the export is a whole-list dump, so handing it
  to a requesting guest discloses every other guest's data. The
  sentence was written to prepare operators for a real request and
  would instead have walked them into a personal-data breach at exactly
  that moment.

## Consequences

- The spec now states established practice's four parts in full: erase
  from live systems immediately; hold pre-redaction backups *beyond
  use* — neither restored nor accessed for any purpose — until they
  rotate out; re-apply the redaction if a restore happens; and bound the
  whole thing with a stated retention window (30 days, rotating, never
  exceeding `PURGE_AFTER_DAYS`) that the data subject is told about.
- What the app does directly: export carries `redactedAt`, and import
  lets redaction win on conflict, so no partial or repeated import
  un-redacts.
- The subject-access fix is routing, not new machinery:
  ADR-058's self-service view already serves the guest-side case
  correctly and per-guest, so guest requests go to `/wishlists/{slug}/my-data`
  while export stays owner-side portability and backup only.
- ADR-033's crypto-shredding deferral was re-examined against backups
  kept beyond the window and still stands: every scheme relocates the
  operator's retention duty rather than removing it, so the app's part
  is making that duty visible. The deferral still depends on `purgeAt`
  keeping retention short, and should be revisited if that stops being
  true.
- The redaction warning names no guest — only the redaction time and
  delete-by date — keeping to [privacy](../spec/privacy.md)'s rule that
  guest names and emails never appear in logs.
