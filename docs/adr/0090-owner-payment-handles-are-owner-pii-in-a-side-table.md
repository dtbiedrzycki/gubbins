# 0090. Owner payment handles are owner PII in a side table

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** dtbiedrzycki

## Context

Until now, a list's Venmo and Zelle handles sat on `wishlists` and couldn't
be changed (ADR-[082](./0082-payment-handles-set-at-list-creation.md) as
first written). The owner
wants to edit them, and once they can change, each pledge must record where
the guest was told to pay
(ADR-[045](./0045-contribution-snapshots-its-payment-method-at-pledge-time.md)),
so the owner can match payments in the gift details
(ADR-[089](./0089-the-owner-reveals-who-gave-what-on-demand.md)).

A handle is the owner's personal data. Guest personal data already lives in
a redactable side table, one row per record, referenced from events rather
than written into them
(ADR-[057](./0057-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)).
The design is in the
[payment handles spec](../superpowers/specs/2026-11-24-payment-handles-design.md).

## Decision

Owner payment handles are owner PII, stored in an `owner_pii` table that
follows ADR-057's pattern: one row per record, never shared, nulled in
place on erasure so every reference still resolves.

- The list's current Venmo and Zelle handles are rows in `owner_pii`,
  referenced from the wishlist. Editing a handle changes its row in place,
  clearing one deletes its row, and adding one inserts a row.
- Each pledge that names a handle gets its own `owner_pii` row holding
  `{ method, handle }`, referenced from the contribution by `ownerPiiRef`.
  Pledge rows are never edited, only redacted on erasure.
- That `{ method, handle }` is the guest's report, recorded as sent after a
  format check, without proof that the list ever had that handle. The
  pledge itself is unproven (the server can't check the amount or that the
  guest paid), and the owner checks every pledge against their own
  accounts.
- `ContributionPledged` carries only the reference, as an optional
  `ownerPiiRef` (still v1), never the handle text.
- The pledge use case mints the pledge's `ownerPiiRef` beside its
  `owner_pii` insert, as it does `guestPiiRef` beside the `guest_pii`
  insert. The aggregate mints every other id, including the list's handle
  rows.

## Alternatives considered

- **Keep the list's handles on `wishlists`** — rejected: cheaper, but owner
  PII stays mixed with list settings instead of in a table named for it.
- **Handle text on `contributions`** — rejected: owner PII in a ledger
  projection, out of reach of a single erasure update.
- **Pledges reference shared, immutable handle rows, proven by a server
  signature** — rejected: it refuses made-up handles, but needs a signing
  key, signature expiry, row reuse when a handle changes back, a changed
  guest contract and more PRs, to guard a note only the owner sees.
- **Keep every handle the list ever had** — rejected: it keeps data the
  owner thinks is gone. Only pledges keep a copy of an old handle.

## Consequences

- Erasure, when it is built, is one update on `owner_pii`; the gift details
  then show the method without the handle.
- A hand-built request can record a handle that isn't the owner's. The
  owner sees a handle they don't recognise, as with any false pledge.
- A pledge is never refused because its handle is no longer the list's;
  the gift details flag it instead (ADR-045).
- `wishlists.venmo_handle` and `zelle_handle` go, replaced by references to
  `owner_pii` rows.
