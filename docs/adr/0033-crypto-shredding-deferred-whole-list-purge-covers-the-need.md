# 0033. Crypto-shredding deferred; whole-list purge covers the need

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Full crypto-shredding — per-subject encryption keys, encrypted PII
columns, a key-destruction ceremony — was weighed against the system's
actual stated privacy requirement. The whole-list purge at `purgeAt`
already deletes PII on a schedule ([privacy](../spec/privacy.md)), so at
the time, a pre-purge single-guest erasure requirement (deleting one
guest's data before the whole list is purged) was only a hypothetical
possibility rather than a stated need.

## Decision

We will defer full crypto-shredding; the existing whole-list purge at
`purgeAt` covers the stated privacy need, with a documented fallback
path (a redaction event) held in reserve in case a pre-purge
single-guest erasure requirement is intended later.

## Alternatives considered

- **Building full crypto-shredding now** (per-subject keys, encrypted
  PII columns, a key-destruction ceremony) — rejected under YAGNI (see
  ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md)):
  it solves a problem the spec doesn't currently have, since the
  whole-list purge already deletes PII on schedule.
- **Storing the shredding key alongside the data in the same database
  file** — rejected when this deferral was later re-tested: a same-file
  key store is defeated by `VACUUM INTO`
  (ADR-[031](./0031-physical-backup-via-vacuum-into-not-raw-file-copy.md)),
  which would copy the key into the same backup snapshot as the
  ciphertext it's meant to protect.
- **Storing the shredding key in a separate container** — rejected when
  this deferral was later re-tested: forbidden by the project's
  single-container deployment posture ([ops](../spec/ops.md)), and
  costly well beyond standing up the container itself.

## Consequences

- The pre-purge single-guest erasure need this decision originally
  treated as hypothetical did later materialize — a GDPR-facing
  self-hosted app realistically receives erasure requests before an
  event's `purgeAt`. ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)
  later addressed that need with a redactable side table for guest PII,
  which replaces this decision's originally sketched compensating-event
  fallback without reopening the deferral of full crypto-shredding
  itself.
- This deferral was also later re-tested against a concrete case the
  original decision didn't consider: erasure across backups, where
  crypto-shredding is the only technique that genuinely works, since
  ciphertext can remain in every snapshot once the key is gone.
  ADR-[065](./0065-erasure-across-backups-and-the-subject-access-routing-fix.md)
  worked through that case and upheld the deferral.
- The deferral holds specifically because `purgeAt` bounds retention to
  months, making the exposure a few weeks of beyond-use ciphertext
  rather than indefinite plaintext. That dependency is now an explicit
  revisit trigger: if `PURGE_AFTER_DAYS` ever becomes unbounded or
  indefinite retention is wanted, this deferral should be reopened.
