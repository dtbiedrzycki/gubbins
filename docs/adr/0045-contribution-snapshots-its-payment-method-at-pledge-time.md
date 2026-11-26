# 0045. Contribution snapshots its payment method at pledge time

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki
- **Amended:** 2026-11-26. The snapshot is `{ method, handle }` as the guest reports it, in the pledge's own `owner_pii` row (ADR-[090](./0090-owner-payment-handles-are-owner-pii-in-a-side-table.md)); a stale snapshot never refuses a pledge; `label` is dropped; earlier pledges have none.

## Context

ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md)
established that `targetMinor` is read live and never snapshotted onto a
Contribution. Payment method is the opposite case, and this is a
deliberate, named exception to that rule rather than a contradiction of
it: the distinction is substantive, not drift. `targetMinor` is a live
input to the `canAccept` policy decision, whereas a payment method is a
historical record of the instruction a specific guest was given. If an
owner rotates their Venmo handle or swaps a bank account mid-list,
reconciliation must be able to tell which destination older pledges were
sent to; a live read would silently rewrite that history and make
reconciliation wrong in exactly the situation where the owner most needs
it right.

## Decision

Each pledge snapshots its payment method at pledge time, limited to
`{ method, handle }`: the method the guest picked and the handle they paid,
as the guest reports it. The Contribution holds only a reference to the
pledge's own `owner_pii` row
(ADR-[090](./0090-owner-payment-handles-are-owner-pii-in-a-side-table.md));
the handle is not on the Contribution or in the event.

A pledge is never refused because its snapshot is stale: a guest who has
already paid an old handle must still be able to record it. The gift
details flag a snapshot that is no longer the list's current handle.

There is no `label` or `instructions` to snapshot: lists have only Venmo
and Zelle (ADR-[082](./0082-payment-handles-set-at-list-creation.md)).

## Alternatives considered

- **Read the payment method live, matching ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md)**
  — rejected: a payment method is a historical record of where money was
  sent, not a live policy input like `targetMinor`, and a live read would
  silently rewrite reconciliation history whenever an owner rotates a
  handle or swaps accounts.

## Consequences

- Reconciliation stays accurate across handle/account rotation: older
  pledges keep pointing at the destination they actually named.
- This is a distinct, narrower question than
  ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md),
  which keeps `targetMinor` live-read for an unrelated reason (it is a live
  policy input, not a historical record). That decision is not reopened
  here: `targetMinor` stays live-read, only the payment method is
  snapshotted.
- Pledges made before the snapshot existed, or sent without a method, have
  none; the gift details say the method wasn't recorded.
- If ADR-044's `instructions` return, they stay presentational and read
  live, outside the snapshot.
