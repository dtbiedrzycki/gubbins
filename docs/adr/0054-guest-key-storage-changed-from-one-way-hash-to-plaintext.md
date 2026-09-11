# 0054. Guest key storage changed from one-way hash to plaintext

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Guest key storage changed from one-way hash (`keyHash`) to plaintext (`key`), matching the existing unhashed treatment of `ownerToken` and hold `secret` — removes an inconsistency rather than introducing new risk, and enables on-demand QR regeneration

## Detail

**ADR-054 detail:** The original design hashed the guest key (Argon2id/
scrypt) while leaving `ownerToken` and hold `secret` in plaintext — an
inconsistency, not a considered tiered-security design; no rationale in
v0.9 explains why the guest key specifically warranted one-way storage
when the other two bearer secrets didn't. That hashing also blocked any
on-demand QR-regeneration feature, since plaintext existed only
transiently at creation/rotation. Reversible symmetric encryption was
considered as a middle path (decrypt-on-demand under a server-side
secret) but rejected: it would introduce a new single point of failure
(losing the encryption secret locks out every guest instance-wide) and a
new env var, in exchange for protection against a threat — DB-file or
backup theft — that §[3.7](../spec/privacy.md) already places out of the application's scope
by design. Plaintext storage was chosen instead: it fixes the actual
inconsistency (all three bearer secrets now treated identically), adds
no new failure mode, and is no weaker against the threats this spec
already defends against (brute-force guessing is stopped by rate
limiting and unguessable `TokenGenerator` output, not by hashing —
ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md), ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md); constant-time comparison, ADR-[036](./0036-constant-time-comparison-generalized-to-all-secret.md), still applies to
the plaintext compare).
