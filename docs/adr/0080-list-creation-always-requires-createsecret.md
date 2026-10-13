# 0080. List creation always requires a CREATE_SECRET

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** dtbiedrzycki

## Context

ADR-[014](./0014-list-creation-self-locks-gated-by-createsecret-thereafter.md)
let the first list be created freely and locked creation behind a
`CREATE_SECRET` afterwards. The launch cut exposes list creation on a public
instance, so a window where anyone can create the first list is not wanted.

## Decision

List creation always requires a `CREATE_SECRET` value. The app refuses to
start without one, and a missing or wrong value gets a 403. This amends
ADR-014: the self-lock after the first list is not built.

## Alternatives considered

- **Self-lock after the first list (ADR-014)** — rejected: it leaves the
  first-list window open and needs state to track whether a list exists.

## Consequences

- Every instance operator must set the variable. The dev `.env.example`
  documents it.
