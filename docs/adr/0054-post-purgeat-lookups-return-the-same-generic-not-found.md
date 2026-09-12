# 0054. Post-purgeAt lookups return the same generic not-found response

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

A distinguishable "this list has ended" response for recently-purged
slugs would be a better experience than a bare not-found for a guest who
bookmarked the list or an owner who lost track of `purgeAt`. But any such
distinguishable response has to be weighed against the enumeration guard
ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)
already established: that every failed lookup returns an identical,
generic response regardless of cause.

## Decision

We will have post-`purgeAt` lookups return the same generic not-found
response as a never-existed slug — not a distinguishable tombstone state
— softened only with an unconditional, non-distinguishing hint that links
can expire, present on every failure regardless of cause. This upholds
ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)'s
enumeration guard rather than carving an exception to it.

## Alternatives considered

- **A distinguishable "this list has ended" response for recently-purged
  slugs** — rejected: it reopens exactly what
  ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)
  closed. If "purged" is a distinguishable outcome from "never existed,"
  anyone probing a slug learns whether it was ever real — a genuine, if
  narrow, enumeration leak. ADR-016 was written as a blanket rule
  specifically to avoid special-casing individual failure modes like this
  one.

## Consequences

- This is a partial answer, not a full one: a guest genuinely can't tell
  "I mistyped this" from "this expired" from the response alone. That
  ambiguity is the accepted cost of keeping
  ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)
  a hard rule rather than a rule with an exception.
- The generic response gains a second, unconditional sentence about
  lists expiring in general, present on every failure regardless of
  cause, so it carries no per-slug signal.
