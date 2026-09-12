# 0054. Guest key storage changed from one-way hash to plaintext

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The original design hashed the guest key (Argon2id/scrypt) while leaving
`ownerToken` and hold `secret` in plaintext — an inconsistency, not a
considered tiered-security design; no rationale explains why the guest
key specifically warranted one-way storage when the other two bearer
secrets didn't. That hashing also blocked any on-demand QR-regeneration
feature, since plaintext existed only transiently at creation/rotation.

## Decision

We will store the guest key as plaintext (`key`), replacing the one-way
hash (`keyHash`), matching the existing unhashed treatment of
`ownerToken` and hold `secret`. This removes an inconsistency rather than
introducing new risk, and enables on-demand QR regeneration.

## Alternatives considered

- **Keep the one-way hash** — rejected: it was never a considered
  tiered-security design, just an inconsistency against the other two
  bearer secrets, and it blocks on-demand QR regeneration since plaintext
  only existed transiently at creation/rotation.
- **Reversible symmetric encryption** (decrypt-on-demand under a
  server-side secret) — rejected as a middle path: it introduces a new
  single point of failure (losing the encryption secret locks out every
  guest instance-wide) and a new env var, in exchange for protection
  against a threat — DB-file or backup theft — that
  [privacy](../spec/privacy.md) already places out of the application's
  scope by design.

## Consequences

- All three bearer secrets (`ownerToken`, hold `secret`, guest `key`) are
  now treated identically, fixing the actual inconsistency and adding no
  new failure mode.
- Plaintext storage is no weaker against the threats this spec already
  defends against: brute-force guessing is stopped by rate limiting and
  unguessable `TokenGenerator` output, not by hashing
  (ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md),
  ADR-[042](./0042-rate-limit-thresholds-set-as-concrete-hardcoded-defaults.md)).
  Constant-time comparison
  (ADR-[036](./0036-constant-time-comparison-generalized-to-all-secret.md))
  still applies to the plaintext compare.
- Enables ADR-[055](./0055-guest-invite-qr-available-on-demand-from-the-owner-dashboard.md)'s
  on-demand QR regeneration, which depends on this decision's precise
  guarantee of plaintext storage.
