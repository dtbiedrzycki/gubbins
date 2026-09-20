# 0067. Erasure across backups, and the subject-access routing fix

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Erasure is immediate in the live database and time-bounded in backups: JSON export carries `guest_pii` with `redactedAt`, import lets redaction win on conflict, and the remaining obligation is procedural — beyond-use pending rotation, re-apply after any restore, bounded by a stated backup retention window never exceeding `PURGE_AFTER_DAYS`. Separately, guest subject-access requests are served by ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md) self-service, never by JSON export, which is a whole-list dump that would disclose every other guest's data

## Detail

**ADR-067 detail:** §[3.7](../spec/privacy.md) asserted erasure was one-way while §[3.11](../spec/ops.md)
offered JSON export/import as full logical backup, and the two were
never reconciled. A guest erases, the operator restores a snapshot from
the day before, the name returns. This is not unique to Gubbins — every
backup system has it — but the spec claimed an unqualified guarantee,
which is worse than claiming a qualified one.

The first resolution drafted told operators to delete backups predating
the request. That is a blunt instruction nobody follows, and it was not
how the problem is actually handled. Established practice has four
parts, and the spec was missing the one that carries the weight: erase
from live systems immediately; hold pre-redaction backups *beyond use*,
neither restored nor accessed for any purpose, until they rotate out;
re-apply the redaction if a restore happens; and bound the whole thing
with a stated retention window that the data subject is told about.
§[3.18](../spec/backup-restore-and-upgrade.md) had no retention guidance whatsoever — no window, no rotation, no
count — which is precisely why the operator had nothing to put in a
privacy notice and no way to discharge the obligation. A 30-day rotating
window, never exceeding `PURGE_AFTER_DAYS`, closes that.

What the app can do cheaply, it does: export carries `redactedAt`, and
import lets redaction win on conflict, so no partial or repeated import
un-redacts. A redaction journal surviving restore and re-applying itself
was considered and rejected — it only works if the journal lives outside
the database being restored, meaning a second store, a second retention
question, and a file that is itself a record of who exercised erasure.

Crypto-shredding was re-examined here rather than assumed still deferred,
since it is the one technique that actually solves the backup case. See
ADR-[034](./0034-crypto-shredding-deferred-whole-list-purge-covers-the-need.md) for the two key-store placements evaluated and why both fail for
this project, and for the explicit revisit trigger: the deferral depends
on `purgeAt` keeping retention short, and collapses if that ever stops
being true.

The same review found a more immediate problem in the adjacent bullet.
§[3.7](../spec/privacy.md) recommended JSON export as satisfying "most subject-access/
portability requests" — but the export is a whole-list dump, so an
operator handing it to a requesting guest discloses every other guest's
name, email, and message. The sentence was written to prepare operators
for a real request and would instead have walked them into a personal-
data breach at exactly that moment. ADR-[060](./0060-guest-self-service-data-access-erasure-via-guestdataaccess.md)'s self-service view already
serves the guest-side case correctly and per-guest, so the fix is
routing rather than new machinery: guest requests go to
`/{slug}/my-data`, export stays owner-side portability and backup.
