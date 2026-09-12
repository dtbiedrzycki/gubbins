# 0072. Kysely as the query builder

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** dtbiedrzycki

## Context

ADR-[012](./0012-clean-architecture-backend-front-end-does-not-mirror-it.md)
already ruled out a full ORM for backend persistence — domain entities
must stay free of ORM decorators — and left the query builder choice
between Kysely and Drizzle open. The event-sourced ledger
([backend architecture](../spec/backend-architecture.md)) needs
repositories to own raw SQL closely: appending to an event stream and
replaying it for projection rebuilds are both easier to reason about
the closer the code stays to the actual SQL being executed.

## Decision

We will use Kysely as the query builder for all SQLite persistence.

## Alternatives considered

- **Drizzle** — rejected: its own schema DSL, relational query API, and
  migration tool are a good fit for straightforward CRUD, but add a
  layer of abstraction between application code and the SQL actually
  executed. That abstraction is less natural for an event-log
  append/replay pattern, where repositories need to reason about exact
  statements (optimistic-concurrency checks via `expectedSeq`, in
  particular).

## Consequences

- Repositories in `infrastructure/` write SQL through Kysely's
  type-safe query builder; there is no separate schema-definition layer
  to keep in sync with the database — the `Database` interface passed
  to `Kysely<Database>` is the single source of truth for table shapes.
- Migrations are plain functions using `db.schema.createTable(...)`,
  not a Drizzle-style declarative schema file.
