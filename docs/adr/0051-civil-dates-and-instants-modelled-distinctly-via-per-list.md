# 0051. Civil dates and instants modelled distinctly via per-list timezone

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Decision

Civil dates (`eventDate`) and instants are modelled distinctly; a per-list IANA `timezone` resolves civil dates to instants; instants render in the viewer's zone and every absolute time displayed states its zone explicitly, with the list zone shown alongside when the two differ

## Detail

**ADR-051 detail:** The spec was silent on timezones while depending on them in
five places (`eventDate`, `revealAfter`, `purgeAt`, hold expiry, and all `Intl`
formatting). Containers default to UTC, so the naive implementation compares a
civil date against server midnight and reveals claim status either hours early
or a day late depending on which side of Greenwich the event sits — and early is
the failure that matters for a mechanism whose entire purpose is preserving a
surprise, and the one that occurs for every event in the Americas. Storing
everything as UTC instants including `eventDate` was considered and rejected: it
is simpler internally, but it turns list creation into "pick the exact UTC
instant your event ends," which is a poor question for the non-technical owner
audience and the ten-minute-setup principle, and getting it wrong leaks the
spoiler. IANA identifiers are required rather than UTC offsets so DST is
resolved by the tz database rather than by an owner choosing a number that is
wrong for half the year. On display: rendering an instant silently in the
viewer's zone was rejected as insufficient — correct but unfalsifiable from the
user's side, since a guest reading "expires Thursday 11pm" cannot tell whose
Thursday it is, and the cost of guessing wrong falls on the hold and contribute
paths specifically. Stating the zone on every absolute time, and both zones
where they differ, is a small amount of visual noise against a real ambiguity on
the commitment-critical flows. Retrofit cost was also a factor: adding the field
later means backfilling a zone onto existing lists with no way to recover what
it should have been.
