# 0055. Guest-invite QR available on demand from the owner dashboard

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

With ADR-[054](./0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)'s
move to plaintext guest-key storage, on-demand QR generation needs no
decrypt step and no availability-window special-casing: the current key
can simply be read and passed through the existing local QR generator
already built for payment methods ([payments](../spec/payments.md)).

## Decision

We will make the guest-invite QR available on demand from the owner
dashboard at any time, not only at creation/rotation, by reusing the
existing local QR generator to build the keyed link from
ADR-[069](./0069-the-guest-key-travels-in-a-fragment.md).

## Alternatives considered

- **Restricting QR display to an availability window** (e.g., only at
  creation/rotation) — rejected: it was a limitation of the prior hashed
  key storage, not a deliberate constraint, and ADR-054's plaintext
  storage removes the reason for it.
- **A new QR generation mechanism** — rejected: the local QR generator
  already built for payment methods covers this case, so building a
  second one is unnecessary duplication.

## Consequences

- This decision depends on ADR-[054](./0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)'s
  plaintext storage; the two should be read in order.
- Rotation still invalidates prior printed cards, since the underlying
  key changes — the owner must be aware that a newly generated QR
  supersedes any previously printed one.
