# 0049. Civil dates and instants modelled distinctly via per-list timezone

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The spec was silent on timezones while depending on them in five places
(`eventDate`, `revealAfter`, `purgeAt`, hold expiry, and all `Intl`
formatting). Containers default to UTC, so a naive implementation compares
a civil date against server midnight and reveals claim status either hours
early or a day late depending on which side of Greenwich the event sits —
and early is the failure that matters for a mechanism whose entire purpose
is preserving a surprise, and the one that occurs for every event in the
Americas. This decision is foundational for how later reveal-timing
decisions reason about `eventDate` and `revealAfter`.

## Decision

We will model civil dates (`eventDate`) and instants distinctly. A
per-list IANA `timezone` resolves civil dates to instants. Instants render
in the viewer's zone, and every absolute time displayed states its zone
explicitly, with the list zone shown alongside when the two differ.

## Alternatives considered

- **Store everything as UTC instants, including `eventDate`** — rejected:
  simpler internally, but it turns list creation into "pick the exact UTC
  instant your event ends," a poor question for the non-technical owner
  audience and the ten-minute-setup principle, and getting it wrong leaks
  the spoiler.
- **Accept UTC offsets instead of IANA identifiers** — rejected: DST would
  then be resolved by an owner choosing a number that is wrong for half
  the year, rather than by the tz database.
- **Render an instant silently in the viewer's zone with no zone label** —
  rejected as insufficient: correct but unfalsifiable from the user's side,
  since a guest reading "expires Thursday 11pm" cannot tell whose Thursday
  it is, and the cost of guessing wrong falls on the hold and contribute
  paths specifically.

## Consequences

- Stating the zone on every absolute time, and both zones where they
  differ, is a small amount of visual noise against a real ambiguity on
  the commitment-critical flows (holds, contributions).
- Retrofit cost was a factor in deciding now rather than later: adding the
  field later means backfilling a zone onto existing lists with no way to
  recover what it should have been.
- Later reveal-timing decisions build on this civil-date/instant
  distinction rather than re-deriving it.
