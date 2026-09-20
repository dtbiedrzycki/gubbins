# 0070. revealedAt makes owner claim-status reveal one-way sticky

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

`revealAfter` is a stored instant the owner can edit
(ADR-[064](./0064-revealafter-is-stored-not-derived.md)). Once the list
crosses it, owner-facing claim status and identity are revealed
(ADR-[020](./0020-owner-status-identity-visibility-auto-reveals-at-revealafter.md))
and the owner may already have seen them. Evaluated only as
`now >= revealAfter`, an edit moving `revealAfter` past `now` would
re-hide what the owner has seen — useless, since they already know, and
confusing, since the dashboard appears to lose data it previously
showed.

## Decision

We will record the first crossing in a `revealedAt` field, set once and
never cleared, so no later edit re-hides claim status the owner has
already seen. It is written lazily, in owner-request middleware ahead of
routing, on the first authenticated owner request where
`revealedAt IS NULL AND now >= revealAfter`, so a settings edit in that
same request cannot outrun it.

## Alternatives considered

- **Recompute visibility purely from `now >= revealAfter`, with no
  stored flag** — rejected: a forward edit to `revealAfter` after the
  crossing re-hides claim status.
- **Set `revealedAt` from a periodic task** — rejected: claim status is
  visible from the moment of crossing, so an edit made before the task's
  next run would still re-hide it. The request-time write is needed
  regardless, which would make the task a second writer of a timestamp
  nothing else reads.
  ADR-[063](./0063-one-periodic-task-with-giver-email-purge-attached.md)
  allows another task with its own ADR; this does not earn one.
- **Store `revealAfter` as a fixed instant instead of adding
  `revealedAt`** — originally rejected here, while `revealAfter` was
  derived from `eventDate`, as making the timezone field silently
  ineffective. ADR-064 later adopted it. It closes the timezone- and
  event-date-edit route to re-hiding but not a direct `revealAfter`
  edit, so it complements `revealedAt` rather than replacing it.

## Consequences

- The reveal condition is `revealedAt IS NOT NULL OR now >= revealAfter`
  ([owner dashboard & editing rules](../spec/owner-dashboard.md)).
- `revealedAt` records the first owner request after the crossing, not
  the crossing itself; nothing depends on the difference.
- Decided while `revealAfter` was derived, when timezone and event-date
  edits could also move it; ADR-064 made it stored, leaving a direct
  `revealAfter` edit as the case this guards.
