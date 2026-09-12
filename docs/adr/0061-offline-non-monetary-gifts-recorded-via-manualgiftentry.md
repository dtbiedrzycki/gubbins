# 0061. Offline non-monetary gifts recorded via ManualGiftEntry table

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

Owners need to record offline gifts that have no amount at all — a
physical item handed over in person, or something not from the registry
at all (cash in a card, an off-list present). `Contribution` exists to
serve money: `pledged`/`confirmed` states, the `canAccept` policy check,
overfunding math against `targetMinor`, a payment-method snapshot. None
of that applies to a non-monetary gift, so a mechanism is needed that
doesn't force one through machinery built for a different problem.

## Decision

We will record offline non-monetary gifts via a `ManualGiftEntry` table
outside the event-sourced ledger — no amount, no ledger event, excluded
from `rebuildProjections`, modeled on the `thank_you_status`/`GuestPii`
precedent for owner-side bookkeeping that has no invariant to protect
(ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md),
ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)).
The optional `itemId` link is advisory-only and never affects item
state. The dashboard offers a combined "also mark as purchased"
checkbox for the common single-item case, without merging the two
mechanisms at the domain level. Erasure is plain deletion.

## Alternatives considered

- **Extend `Contribution` with a nullable `amount` and a
  `kind: monetary | non_monetary` flag** — rejected: everything else on
  `Contribution` exists to serve money, so a non-monetary gift would
  carry meaningless fields (a null amount, a method that isn't really
  "unknown rail" but "not applicable") through machinery built for a
  different problem.
- **Let a `ManualGiftEntry`'s `itemId` link affect the item-availability
  projection** — rejected: the two mechanisms that correctly affect
  availability already exist — "mark as purchased directly" (a ledger
  event, [holds](../spec/holds.md)) for a single item bought in person,
  and a manual `Contribution` (also ledger-tracked,
  [manual contributions](../spec/manual-contributions.md)) for
  group/fund cash handed over offline. Letting the link double as a
  claim on the item would mean a `ManualGiftEntry` silently changes
  guest-facing state depending on whether `itemId` is set — exactly the
  kind of implicit side effect the rest of the spec avoids (cf.
  `targetMinor` read live rather than snapshotted for the same reason,
  ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md)).
- **Merge the data model to remove the two-click friction of the common
  single-item case** — rejected: it would reintroduce the conflation
  problem above. Resolved instead at the UI layer only: one owner click
  fires two independent writes (`ItemPurchased` and a `ManualGiftEntry`
  creation) without either mechanism needing to know about the other.

## Consequences

- `ManualGiftEntry` only covers what's left over: gifts with no bearing
  on any item's claimed/funded state, or a note the owner wants attached
  to an item without asserting it's now taken (e.g. a second,
  complementary gift for an item already marked purchased through the
  real mechanism).
- The combined checkbox only renders where it's unambiguous (a
  still-available `single` item) — not for `group`/`fund` items (no
  "purchased" status to set) or already-purchased items (nothing to
  flip) — which keeps the advisory-link invariant true whenever the
  checkbox isn't offered or isn't checked.
- Because the entry is owner-authored and nothing in the ledger points
  at it via `piiRef`, deleting it outright is a safe and sufficient
  erasure path; the indirection
  ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)
  built for `GuestPii` exists specifically to avoid dangling `piiRef`s
  from immutable events, a problem this entity doesn't have.
