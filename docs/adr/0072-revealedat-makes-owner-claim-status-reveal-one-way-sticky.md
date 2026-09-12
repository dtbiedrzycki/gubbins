# 0072. revealedAt makes owner claim-status reveal one-way sticky

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

`revealAfter` was, at the time of this decision, derived from
`eventDate` rather than stored. Under that scheme, an owner editing the
list's timezone after the event would move `revealAfter` — and a
forward move past `now` would re-hide claim status the owner had
already seen, which is both useless (they already know) and confusing
(the dashboard appears to lose data it previously showed).

## Decision

We will make `revealedAt` sticky once `revealAfter` is first crossed,
so later timezone or event-date edits never re-hide claim status the
owner has already seen. A `revealedAt` field is set once, on first
crossing, and never cleared, making the reveal transition one-way
regardless of what happens to `revealAfter` afterward.

## Alternatives considered

- **Recompute visibility purely from `now >= revealAfter`, with no
  stored flag** — rejected: with `revealAfter` derived, this
  recomputation is exactly what re-hides claim status on a later
  timezone or event-date edit, reproducing the problem this decision
  exists to solve.
- **Store `revealAfter` itself as a fixed instant at creation, instead
  of adding `revealedAt`** — rejected at the time: this would make the
  owner's timezone field silently ineffective after the fact, which was
  judged worse than the problem it solves.

## Consequences

- ADR-[066](./0066-revealafter-is-stored-not-derived.md) later revisited
  the rejected alternative above and reversed it: `revealAfter` is now
  stored as a fixed instant set at creation rather than derived, which
  removes the original timezone-re-hiding concern this ADR was built to
  solve — a stored instant does not move on a later timezone or
  event-date edit, so there is nothing left for such an edit to re-hide
  through `revealAfter` alone. `revealedAt`'s stickiness is retained
  regardless: it now guards the narrower remaining case of a *direct*
  edit to the now-stored `revealAfter` after the crossing, still
  ensuring such an edit cannot re-hide claim status the owner has
  already seen. Superseded only in part by ADR-066 — the
  derived-`revealAfter` premise this ADR was built on is superseded, but
  the stickiness mechanism decided here is not, and still stands,
  guarding that narrower case.
- Nothing in the original decision specified what sets `revealedAt`:
  "set once when `revealAfter` is first crossed" implies a
  time-triggered write, but the spec has no scheduler for it, and
  ADR-[065](./0065-one-periodic-task-with-giver-email-purge-attached.md)
  subsequently fixed the count of periodic tasks at one, with two
  unrelated duties, ruling out adding a scheduler for this. The write is
  therefore lazy, placed in owner-request middleware ahead of routing
  rather than on dashboard render, so an owner who returns after the
  crossing and edits settings before viewing the dashboard cannot
  outrun the flag.
