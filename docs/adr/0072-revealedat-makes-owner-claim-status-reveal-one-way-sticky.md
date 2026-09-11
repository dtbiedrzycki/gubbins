# 0072. revealedAt makes owner claim-status reveal one-way sticky

- **Status:** Accepted
- **Date:** Not recorded (pre-repository decision, imported from `gubbins-spec.md`)
- **Deciders:** Not recorded

## Decision

`revealedAt` makes owner claim-status reveal one-way sticky once crossed; later timezone or event-date edits never re-hide what the owner has already seen

## Detail

**ADR-052a detail:** Because `revealAfter` is derived rather than stored, an owner
editing the list timezone after the event would move it — and a forward move
past `now` would re-hide claim status the owner has already seen, which is both
useless (they already know) and confusing (the dashboard appears to lose data).
A stored `revealedAt`, set once on first crossing and never cleared, makes the
transition one-way. Recomputing visibility purely from `now >= revealAfter` was
rejected for that reason; storing `revealAfter` as a fixed instant at creation
instead was also rejected, since it would make the timezone field silently
ineffective after the fact, which is worse than the problem it solves.

Superseded in part by ADR-[066](./0066-revealafter-is-stored-not-derived.md), which stores `revealAfter` as an instant
set at creation rather than deriving it. The concern recorded above — a
timezone edit moving a derived `revealAfter` forward and re-hiding what
the owner has seen — no longer arises, since the instant does not move.
`revealedAt` is retained and still one-way, now guarding the narrower
case of a *direct* edit to `revealAfter` after the crossing.

Nothing set `revealedAt` in the original decision: "set once when
`revealAfter` is first crossed" implies a time-triggered write, but the
spec has no scheduler for it and ADR-[065](./0065-one-periodic-task-with-giver-email-purge-attached.md) subsequently fixed the count of
periodic tasks at one, with two unrelated duties. The write is therefore
lazy, placed in owner-request middleware ahead of routing rather than on
dashboard render, so an owner who returns after the crossing and edits
settings before viewing the dashboard cannot outrun the flag.
