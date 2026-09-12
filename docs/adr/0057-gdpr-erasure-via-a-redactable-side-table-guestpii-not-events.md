# 0057. GDPR erasure via a redactable side-table (GuestPii), not events

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

ADR-[033](./0033-crypto-shredding-deferred-whole-list-purge-covers-the-need.md)
anticipated a pre-purge single-guest erasure requirement might
materialize and sketched a `ContributionRedacted`/`HoldRedacted`
compensating event as the lighter-weight fix if it did. This ADR is a
later refinement of the approach ADR-033 deferred to, not an overturning of
it: on closer inspection that compensating-event sketch doesn't actually
satisfy GDPR erasure. A compensating event nulls the read-side
*projection*, but the original `ContributionPledged`/`ItemHeld` event —
immutable and authoritative per
ADR-[007](./0007-event-sourcing-for-the-ledger-only-audit-table-for-crud.md)/[008](./0008-event-streams-scoped-per-item-not-per-list.md)
— still carries the plaintext PII in its payload forever, so
`rebuildProjections` reconstructs the null correctly but the source of
truth was never actually erased.

## Decision

We will honor GDPR erasure via a redactable side-table (`GuestPii`),
referenced from events by `piiRef` rather than embedding PII in event
payloads. Redaction nulls the row's contents in place (the id persists,
so no orphaned references) and is one-way. `GuestPii` is deliberately
per-record, not per-guest — one row per hold or contribution, even where
one session creates several.

## Alternatives considered

- **The compensating-event fix ADR-033 sketched** — rejected on closer
  inspection: it nulls the projection but leaves the original immutable
  event carrying plaintext PII forever, so the source of truth is never
  actually erased.
- **Mutating event payloads directly** — rejected outright: this isn't a
  scoped exception, it invalidates the immutability assumption every
  other event-sourcing decision from
  [data & persistence](../spec/data-and-persistence.md) onward depends
  on.
- **Session-scoped (per-guest) `GuestPii` rows** instead of per-record —
  rejected: three of the table's four fields are genuinely per-record.
  `message` is the giver's note on *this* hold or *this* pledge
  ([guest UX](../spec/guest-ux.md)), and a session-scoped row would force
  it back onto the Hold/Contribution — returning PII to the event
  payload, the exact thing this ADR prevents. `name` may legitimately
  differ between records ("Dave" on a hold, "Dave & Sarah" on a pledge),
  and a shared device at an event is one session with several actual
  people behind it, so a shared row would let one guest overwrite
  another. `email` is hold-only and carries its own grace-period purge
  ([privacy](../spec/privacy.md)), which is a simple per-row check under
  1:1 and a cross-record question otherwise. A session-scoped row would
  also let the owner's per-row redact action silently strip identity from
  records not visible on the screen they are acting from.

## Consequences

- Redaction becomes a real, simple `UPDATE` on one row — no compensating
  event, no fold-order dependency, no risk of the ledger's source of
  truth still holding what the owner was told was erased.
- The row is nulled rather than deleted specifically so every `piiRef` in
  the event log always resolves: a deleted row would leave a dangling
  reference that reads as data corruption on inspection, while a
  redacted-but-present row reads as exactly what it is.
- Erasure is available independent of spoiler/reveal state, since a
  guest's erasure right has no relationship to the owner's chosen
  claim-status-visibility preference.
- This is deliberately the opposite granularity from
  ADR-[058](./0058-guest-self-service-data-access-erasure-via-guestdataaccess.md)'s
  session-scoped access secret, and the two should be read together:
  storage is granular here, access is holistic there.
  ADR-[058](./0058-guest-self-service-data-access-erasure-via-guestdataaccess.md)
  aggregates upward — session → holds/contributions via `sessionHash` → N
  `GuestPii` rows via `piiRef` — and erases all of them in one guest
  action. Granular rows can always be aggregated into a holistic view; a
  shared row cannot be decomposed back into per-record ones. The visible
  duplication (five rows carrying the same name for a guest with three
  holds and two pledges) is the intended cost and must not be normalized
  away.
