# 0073. Vite + React SPA, served by the backend

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** dtbiedrzycki

## Context

`frontend-architecture.md` already assumes React (hooks, TanStack
Query, "dumb components") without stating it explicitly, and the
devcontainer configures `.tsx` formatting — but no build tool or
delivery model (plain SPA vs. a meta-framework) had been chosen.
The app's guest-facing surface is mostly client interaction behind a
key gate, and the project's own design principles rule out a CDN and
commit to a ten-minute self-hosted setup.

## Decision

We will build the front-end as a Vite-bundled React SPA, served as
static files by the same Fastify process that serves the API — one
process, one port, no separate host or build pipeline to deploy.

## Alternatives considered

- **Next.js or React Router in framework mode** — rejected: SSR and
  framework routing conventions add a second build pipeline and
  runtime concern this app's guest-facing surface doesn't need. Nothing
  in the specs calls for server-rendered HTML (no SEO surface — lists
  are unguessable-URL-gated, not publicly indexed, per
  [access & identity](../spec/access-identity.md), ADR-[016](./0016-no-public-list-directory-lookups-fail-generically.md)).

## Consequences

- `apps/api`'s Fastify server registers a static-file plugin serving
  `apps/web`'s built `dist/` directory; there is no separate deploy
  target for the front-end.
- Client-side routing (e.g. `/{slug}`) requires the static plugin to
  fall back to `index.html` for unmatched paths rather than 404ing.
- If a future requirement needs server-rendered HTML (unlikely per the
  no-public-directory design), that would be a new ADR superseding
  this one, not a silent addition.
