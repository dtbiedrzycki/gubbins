# 0012. Clean Architecture backend; front-end does not mirror it

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** dtbiedrzycki

## Context

The backend owns all domain logic — claim rules, hold lifecycle,
contribution policy — and needs that logic to stay testable and
decoupled from infrastructure (SQLite, SMTP, the metadata fetcher) as
the system grows. The front-end has no domain logic of its own to
protect: business rules live server-side, so a layering choice was
needed for each side independently rather than assumed to be the same
one.

## Decision

We will structure the backend as **Clean Architecture** in four layers
— `domain/` (entities, value objects, domain errors; zero imports),
`application/` (use cases and port interfaces, depending only on
`domain/`), `infrastructure/` (SQLite repositories, event store,
metadata fetcher, QR, SMTP, crypto), `presentation/` (HTTP routes, zod
schemas, DTO mappers, DI wiring) — enforced in CI via an ESLint rule
banning `infrastructure/*` imports from `domain/*` or `application/*`
([backend architecture](../spec/backend-architecture.md)). The
front-end will **not** mirror this layering: it uses feature folders
(`src/features/holds/`, `src/features/contributions/`) with one typed
API boundary (`src/api/`), TanStack Query for server state, and dumb
components with logic in hooks
([front-end architecture](../spec/frontend-architecture.md)).

## Alternatives considered

- **Mirroring Clean Architecture in the front-end** — rejected: domain
  logic is server-side, so re-expressing the same rule layers client-side
  would duplicate business rules across two codebases with no single
  source of truth, guaranteeing drift between them as rules evolve.
- **A full ORM for backend persistence** — rejected: a full ORM
  typically requires domain entities to carry ORM decorators or extend a
  base class, which would violate the domain layer's zero-imports rule;
  Kysely or Drizzle is used instead, with repositories — not the ORM —
  owning the SQL directly.

## Consequences

- Backend use cases return domain errors as values or typed exceptions;
  only `presentation/` maps them to HTTP status codes, keeping domain and
  application layers free of HTTP concerns.
- Each claim family gets its own use case (`HoldItem`, `ContributeToItem`)
  rather than one polymorphic `ClaimItem`, so the layering doesn't
  collapse into a single catch-all entry point.
- On the front-end, a shared types package generated from zod schemas
  means a backend rename breaks the front-end build immediately rather
  than silently drifting; pure display helpers (currency, percentage
  formatting) may be shared between features, but policy logic may not.
- Because the two sides are architected differently on purpose, a
  contributor moving between them must not assume backend conventions
  (layered ports, DI wiring) apply on the front-end, or vice versa.
