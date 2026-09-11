# 0061. Offline non-monetary gifts recorded via ManualGiftEntry table

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Offline non-monetary gifts recorded via a `ManualGiftEntry` table outside the event-sourced ledger — no amount, no ledger event, modeled on the `thank_you_status`/`GuestPii` precedent (owner bookkeeping, excluded from `rebuildProjections`); `itemId` link is advisory-only and never affects item state; the dashboard offers a combined "also mark as purchased" checkbox for the common single-item case without merging the two mechanisms at the domain level; erasure is plain deletion, since nothing references it via `piiRef`

## Detail

**ADR-061 detail:** The obvious-looking option — extend `Contribution`
with a nullable `amount` and a `kind: monetary | non_monetary` flag —
was rejected because everything else on `Contribution` exists to serve
money: `pledged`/`confirmed` states, the `canAccept` policy check,
overfunding math against `targetMinor`, the payment-method snapshot.
None of it applies to a physical or in-kind gift, so fitting one through
that model means carrying meaningless fields (a null amount, a null
method that isn't really "unknown rail" but "not applicable") through
machinery built for a different problem. The `thank_you_status` /
`GuestPii` precedent (ADR-[021](./0021-thank-you-tracking-stored-outside-rebuildprojections-scope.md), ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md)) already establishes the pattern
for owner-side bookkeeping that has no invariant to protect and no
reason to be replayed: a plain table outside the event stream,
explicitly excluded from `rebuildProjections`. `ManualGiftEntry` follows
the same shape. The optional `itemId` link exists because some in-person
gifts correspond to nothing on the list at all (cash in a card, a gift
not from the registry) — forcing every entry to reference an item would
misrepresent gifts the list never described.

A follow-up question surfaced once the entity existed: since the
projection (`item_state`) drives guest-visible availability, shouldn't
linking a `ManualGiftEntry` to an item affect it? Resolved as no — the
link is explicitly advisory. The two mechanisms that *do* correctly
affect availability already existed before this ADR: "mark as purchased
directly" (§[3.3](../spec/holds.md), a ledger event) for a single item bought in person, and
a manual `Contribution` (§[3.6](../spec/manual-contributions.md), also ledger-tracked) for group/fund cash
handed over offline. `ManualGiftEntry` only covers what's left over —
gifts with no bearing on any item's claimed/funded state at all, or a
note the owner wants attached to an item without asserting it's now
taken (e.g. a second, complementary gift for an item already marked
purchased through the real mechanism). Conflating the two — making a
link double as a claim on the item — would mean a `ManualGiftEntry`
silently changes guest-facing state depending on whether `itemId` is
set, which is exactly the kind of implicit, easy-to-miss side effect the
rest of this spec avoids (cf. `targetMinor` being read live rather than
snapshotted specifically so effects are never hidden in a value that
looks inert, ADR-[018](./0018-group-fund-targetminor-is-editable-and-read-live.md)).

That said, the single most common real case — someone bought the listed
single item in person, full stop — makes "link is inert" pure friction
if it forces two separate dashboard actions for one real-world event.
Rather than merging the data model to remove that friction (which would
reintroduce the conflation problem above), the combined checkbox
resolves it at the UI layer only: one owner click can still fire two
independent writes — `ItemPurchased` and a `ManualGiftEntry` creation —
without either mechanism needing to know about the other. The checkbox
only renders where it's unambiguous (a still-available `single` item);
it doesn't appear for `group`/`fund` items (no "purchased" status
exists to set) or already-purchased items (nothing to flip), which
keeps the advisory-link invariant true in every case where the checkbox
isn't offered or isn't checked.

Because the entry is owner-authored and nothing in the ledger points at
it via `piiRef`, deleting it outright is a safe and sufficient erasure
path; the indirection ADR-[059](./0059-gdpr-erasure-via-a-redactable-side-table-guestpii-not-events.md) built for `GuestPii` exists specifically
to avoid dangling `piiRef`s from immutable events, a problem this entity
doesn't have.
