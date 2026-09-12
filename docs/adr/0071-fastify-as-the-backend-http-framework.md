# 0071. Fastify as the backend HTTP framework

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** dtbiedrzycki

## Context

The backend needs an HTTP framework for the `presentation/` layer
(routes, zod validation, DTO mapping) that performs well on Pi-class
hardware ([performance & resource budget](../spec/performance-and-resource-budget.md), ADR-[029](./0029-performance-resource-targets-set-for-pi-class-hardware.md))
and has mature support for the cross-cutting concerns this app needs
throughout — cookies, rate limiting, CORS, and schema-validated routes
— without hand-rolling middleware for each.

## Decision

We will use Fastify as the backend HTTP framework.

## Alternatives considered

- **Hono** — rejected for this project: lower raw overhead and a modern
  fetch-based API, but a thinner Node plugin ecosystem means more
  hand-rolled middleware for cookies, rate limiting, and CORS — concerns
  this app needs from day one, not deferred.
- **Express** — rejected: the largest ecosystem and the safest default,
  but weaker native TypeScript ergonomics and no built-in schema
  validation story, which would leave zod validation entirely bolted on
  rather than integrated into route definitions.

## Consequences

- Route schemas are defined with zod and validated by Fastify at the
  boundary, keeping `presentation/` the single place HTTP concerns are
  translated to/from domain and application types.
- Fastify's plugin ecosystem (`@fastify/cookie`, `@fastify/static`)
  covers session cookies and serving the built front-end bundle without
  custom code.
- This decision is scoped to the backend process; it says nothing about
  the front-end's build tooling (see ADR-[073](./0073-vite-react-spa-served-by-the-backend.md)).
