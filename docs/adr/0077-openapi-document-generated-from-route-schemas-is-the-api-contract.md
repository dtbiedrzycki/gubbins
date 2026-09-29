# 0077. The OpenAPI document generated from route schemas is the API contract

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** dtbiedrzycki

## Context

The web client's payload shapes could not drift from the server's — both
use the zod schemas in `@gubbins/shared-types` — but the route table could:
paths, methods and status codes were written in `routes.ts`, again in the
web client, and a third time in the web tests' mocks, so a renamed route
left the web unit tests passing. Clients other than the bundled web app are
expected in future, so the contract should be consumable outside
TypeScript.

## Decision

We will treat an OpenAPI document generated from the Fastify route schemas
as the API contract. Routes declare zod schemas through
`fastify-type-provider-zod`; `@fastify/swagger` derives
`apps/api/openapi.json`, which is committed. Every consumer — the web
client, its test mocks, and future clients — generates its types from that
file, and a test fails `npm test` when the committed document is stale.
zod stays the source of truth; the document is a derived artifact.

## Alternatives considered

- **A hand-rolled TypeScript contract** (routes defined once in
  shared-types, client derived at runtime) — rejected: no build step, but
  only TypeScript consumers could use it.
- **ts-rest** — rejected: `@ts-rest/fastify` declares support for Fastify 4
  only.
- **tRPC** — rejected: replaces the REST API with RPC procedures, changing
  the API design rather than protecting it.

## Consequences

- Changing a route or schema means running `npm run gen:api` and committing
  the regenerated `openapi.json` and web types in the same change.
- Pre-1.0, the API makes no compatibility promise: breaking changes are
  allowed and called out in the PR description; additive changes (new
  routes, new optional fields, new statuses) are preferred. The document's
  `info.version` is the release version.
- v1.0 release-checklist item: choose the API versioning scheme (URL
  prefix, header or media type; whether more than one version is served at
  once, weighed against the "latest release only" support policy and the
  Pi-class resource budget) in its own ADR, and add breaking-change
  detection comparing `openapi.json` against the base branch (e.g.
  `oasdiff`, wrapped in a `scripts/` entry per ADR-[038](./0038-ci-runs-on-github-actions-kept-forge-portable.md)).
- The document is not served at runtime; that can be added later without
  changing this decision.
