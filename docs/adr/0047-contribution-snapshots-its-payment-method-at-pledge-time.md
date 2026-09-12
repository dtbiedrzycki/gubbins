# 0047. Contribution snapshots its payment method at pledge time

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

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

We will have a Contribution snapshot its payment method at pledge time,
limited to `{ kind, label, handle }`. `instructions` remain presentational
and are read live.

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
- `instructions` text is intentionally excluded from the snapshot since it
  is presentational rather than part of the reconciliation record, and
  continues to read live.
