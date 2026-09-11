# 0047. Contribution snapshots its payment method at pledge time

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

Contribution snapshots its payment method at pledge time — a deliberate exception to ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md)'s live-read rule, since the method is a historical record of where money was sent, not a live policy input

## Detail

**ADR-047 detail:** ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md) established that `targetMinor` is read live and
never snapshotted. Payment method is the opposite case and the distinction is
substantive rather than drift: `targetMinor` is a live input to the `canAccept`
policy decision, whereas the payment method is a historical record of the
instruction a specific guest was given. If an owner rotates their Venmo handle
or swaps a bank account mid-list, reconciliation must be able to tell which
destination older pledges were sent to; a live read would silently rewrite that
history and make reconciliation wrong in exactly the situation where the owner
most needs it. Snapshotting is limited to `{ kind, label, handle }` —
`instructions` are presentational and read live.
