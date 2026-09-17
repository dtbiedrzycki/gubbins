# Privacy

- Zero outbound requests at runtime by default; self-hosted fonts
- Strict CSP, no inline scripts
- URL metadata scraping **opt-in and SSRF-guarded**: block private IP ranges, block redirects into them, timeouts. Note that fetching reveals the server IP to the retailer.
- Images: prefer owner upload; if fetched, cache locally, strip EXIF, resize. **Never hotlink** (leaks guest IPs).
- **No shipping address collected** (decided). Owner may place it in the list description.
- Giver emails are stored only until 7 days past the hold's `expiresAt`,
  then nulled by the periodic task ([holds](holds.md)). The grace is fixed rather than
  configurable: the email's only consumer is the reminder, which fires
  before expiry, so afterwards it has no use and there is no operator
  judgement to make. This cannot be lazily computed the way hold expiry
  is — nothing reads a stale email, so nothing would trigger the
  evaluation, and a list nobody revisits after the event would otherwise
  hold addresses until `purgeAt`. Whole-list purge remains the backstop,
  so a failing task delays deletion rather than preventing it. No quiet
  mailing list. *(ADR-[063](../adr/0063-one-periodic-task-with-giver-email-purge-attached.md))*
- Auto-purge `PURGE_AFTER_DAYS` after the event date (default 90, [ops](ops.md)).
  The window is deliberately generous rather than minimal: the thank-you
  view ([owner dashboard & editing rules](owner-dashboard.md)) is a post-event tool and a short window would delete the
  owner's thank-you list while they were still working through it.
- Guest names and emails never appear in logs
- Creation-gating invite secrets are configuration, not stored PII: no email collection or verification flow is used to gate list creation (see ADR-[014](../adr/0014-list-creation-self-locks-gated-by-createsecret-thereafter.md))
- **Crypto-shredding: still deferred.** The existing whole-list `DELETE`
  at `purgeAt` already satisfies the stated privacy goal for data still
  live at that point (PII does not persist past the event) — this is a
  plain delete, not per-subject encryption. Full crypto-shredding
  (per-subject encryption keys, destroyed on erasure) remains rejected as
  complexity ahead of demonstrated need (YAGNI, see ADR-[021](../adr/0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md)). **The
  pre-purge single-guest erasure need this bullet originally flagged as
  hypothetical has since materialized** (a GDPR-facing self-hosted app
  realistically receives erasure requests before an event's `purgeAt`) —
  see the redaction model below, which supersedes this entry's originally
  sketched compensating-event fix without reopening the crypto-shredding
  deferral itself. *(ADR-[033](../adr/0033-crypto-shredding-deferred-whole-list-purge-covers-the-need.md), superseded in part by ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))*
- **Operator as GDPR data controller.** The operator determines why guest
  names, emails, and messages are collected and what happens to them —
  squarely the controller role under GDPR for any EU-guest list, with
  this project itself neither controller nor processor (there is no
  hosted service in the loop). Every list renders an app-authored privacy
  notice after key entry ([guest UX](guest-ux.md)): what is collected,
  when it is deleted, the backup retention window, and a link to
  self-service data access. Controller identity and contact come from
  `PRIVACY_CONTACT` ([ops](ops.md)); when unset, the notice says no
  contact has been provided rather than omitting the line. The owner may
  add an optional `privacyNotice` note ([domain model](domain-model.md))
  beneath it. The creation acknowledgement screen
  ([access & identity](access-identity.md)) also states the controller
  obligation plainly at the one moment every owner passes through. *(ADR-[056](../adr/0056-privacy-notice-rendered-by-the-app-with-operator-contact.md))*
- **Right to erasure, honored via redaction, not deletion.** The owner can
  redact an individual hold's or contribution's `GuestPii` row from the
  reconciliation or thank-you view — nulling `name`/`email`/`message` in
  place while the row itself (and its `id`) persists, so the event that
  references it via `piiRef` always resolves to a real row rather than a
  dangling reference. A guest can do the same for all of their own
  records at once via self-service data access ([access & identity](access-identity.md), ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md)). Available
  regardless of `revealedAt` or the spoiler toggles — an erasure right
  isn't gated behind the owner's reveal preference. One-way: `redactedAt`
  is set once and there is no un-redact action, matching the `revealedAt`
  sticky pattern ([owner dashboard & editing rules](owner-dashboard.md), ADR-[070](../adr/0070-revealedat-makes-owner-claim-status-reveal-one-way-sticky.md)) for the same reason — a reversible
  "erasure" invites confusion about whether data was actually removed.
  The amount, item, status, and date on the ledger entry are untouched;
  only identity is stripped, since none of the rest is personal data and
  none of it needs to disappear for the owner's own reconciliation to
  keep working. *(ADR-[057](../adr/0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md))*
- **Subject-access requests from guests are served by self-service
  ([access & identity](access-identity.md), ADR-[058](../adr/0058-guest-self-service-data-access-erasure-via-guestdataaccess.md)), not by JSON export.** A guest asking "what do you
  have on me" gets `/{slug}/my-data`, which shows that guest their own
  holds, contributions, and `GuestPii` and nothing else. The JSON export
  is a whole-list dump: handing it to a requesting guest would disclose
  every other guest's name, email, and message — a breach committed in
  the belief it was compliance. Export remains the right tool for
  *owner-side* portability (moving a list between instances) and for
  logical backup. Docs ([governance, licensing & release](governance-licensing-and-release.md)) must state this split plainly, since the
  distinction is easy to miss under pressure from a real request.
  *(ADR-[065](../adr/0065-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Erasure is immediate in the live database and time-bounded in
  backups.** Restoring a snapshot taken before a redaction reintroduces
  the data, and no application mechanism prevents that. The remaining
  obligation is procedural and follows established practice: redact in
  the live database at once; hold any pre-redaction backup *beyond use*
  — not restored or accessed for any purpose — until it rotates out;
  re-apply the redaction if a restore does happen; and let the backup
  retention window ([backup, restore & upgrade safety](backup-restore-and-upgrade.md)) bound how long that lasts. The
  app-rendered privacy notice states the window, since a guest
  exercising erasure has to be told when backup copies of their data
  will be gone. Each redaction logs a warning, naming no guest, that
  backups taken before it hold the erased data and must be deleted by
  the end of the window. *(ADR-[065](../adr/0065-erasure-across-backups-and-the-subject-access-routing-fix.md))*
- **Data-at-rest theft (stolen SQLite file or stolen backup) is a distinct
  actor from the operator themselves**, and is explicitly out of the
  application's scope to mitigate — encryption-at-rest is a deployment/OS-
  level concern (e.g. an encrypted volume, LUKS), not an app-level one.
  Named explicitly in the threat model ([threat model](threat-model-summary.md)) so operators understand this
  is their responsibility rather than silently assumed away. This also
  covers the guest key, owner token, and hold secrets, all of which are
  stored in plaintext ([access & identity](access-identity.md), ADR-[052](../adr/0052-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)) — the same operator-trust boundary
  already applies uniformly to all of the system's bearer secrets.

---

[← Back to spec index](README.md)
