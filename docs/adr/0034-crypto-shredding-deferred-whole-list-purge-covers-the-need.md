# 0034. Crypto-shredding deferred; whole-list purge covers the need

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Crypto-shredding deferred (confirmed); whole-list purge at `purgeAt` covers the stated need *(the pre-purge single-guest erasure need this entry flagged as hypothetical later materialized — see ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md), which supersedes this entry's proposed compensating-event fix, not its deferral of full crypto-shredding)*; the deferral was re-tested against the backup/erasure conflict in ADR-[067](./0067-erasure-across-backups-and-the-subject-access-routing-fix.md) and upheld, with its dependence on a short `PURGE_AFTER_DAYS` stated as the explicit revisit trigger

## Detail

**ADR-034 detail:** Full crypto-shredding (per-subject keys, encrypted PII columns, key-destruction ceremony) was evaluated against the actual stated requirement and found to solve a problem the spec doesn't currently have — the whole-list purge already deletes PII on schedule. Building the encryption layer now would be complexity ahead of demonstrated need, contrary to the YAGNI principle applied elsewhere (see ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md)). Confirmed deferred by the spec owner; left open only as a documented fallback path (a redaction event) in case a pre-purge single-guest erasure requirement is intended later.

Re-tested in ADR-[067](./0067-erasure-across-backups-and-the-subject-access-routing-fix.md) against a concrete case the original decision did
not consider: erasure across backups, where crypto-shredding is the only
technique that genuinely works, since ciphertext can remain in every
snapshot once the key is gone. Two key-store placements were worked
through and both rejected — same-file (defeated by `VACUUM INTO`) and
separate-container (forbidden by §[3.11](../spec/ops.md)'s single-container rule, and
costly well beyond the container itself). The deferral holds because
`purgeAt` bounds retention to months, making the exposure a few weeks of
beyond-use ciphertext rather than indefinite plaintext. That dependency
is now explicit: if `PURGE_AFTER_DAYS` becomes unbounded or indefinite
retention is ever wanted, this deferral should be reopened.
