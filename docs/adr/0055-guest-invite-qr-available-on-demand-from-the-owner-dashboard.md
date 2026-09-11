# 0055. Guest-invite QR available on demand from the owner dashboard

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Guest-invite QR available on demand from the owner dashboard at any time, enabled by ADR-[054](./0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)'s plaintext storage; reuses existing local QR generation

## Detail

**ADR-055 detail:** With ADR-[054](./0054-guest-key-storage-changed-from-one-way-hash-to-plaintext.md)'s move to plaintext, on-demand QR
generation needs no decrypt step and no availability-window special-
casing: the current key is simply read and passed through the same local
QR generator already built for payment methods (§[3.5](../spec/payments.md)) to build the keyed
link from ADR-[069](./0069-the-guest-key-travels-in-a-fragment.md). Available at any time from the owner dashboard, not
only at creation/rotation. Rotation still invalidates prior printed
cards, since the underlying key changes.
