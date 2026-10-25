# 0083. Database CHECKs back up structural invariants only

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** dtbiedrzycki

## Context

The schema repeated some domain limits as CHECKs, such as the guest name and
message lengths. Each limit was then written and tested twice. The two copies
could drift, and they already counted differently: SQLite's `length()` counts
characters, while JavaScript's `.length` counts UTF-16 code units.

## Decision

The app is the database's only writer, and every write goes through the
domain. Database CHECKs back up structural invariants only: allowed values
(`items.type`, `event_log.actor`, `amount_minor > 0`) and impossible state
combinations. Product limits such as text lengths belong to the domain alone,
with no CHECK and no column ceiling.

## Alternatives considered

- **Keep length CHECKs as a backstop** — rejected: a second copy of each limit
  to keep in step, for a writer that doesn't exist.

## Consequences

- Any future writer (an import tool, an admin script, a second client) must
  write through the domain. If one can't, this decision has to be revisited
  before it ships.
- A length change touches the domain and its tests only.
