# Stack decisions + walking skeleton — design

**Status:** Draft
**Branch:** `feat/walking-skeleton`, off `main` (once `docs/adr-rollout` merges)
**Date:** 2026-09-12

## Purpose

`gubbins` has 70 ADRs and 23 spec topic files documenting a self-hosted
wishlist/registry app in real depth, but the repository is still "early
scaffolding" (per `README.md`): zero application code, and the concrete
tech stack (HTTP framework, query builder, front-end delivery model,
styling) is not yet chosen — only constrained (`docs/adr/0012-*.md`:
Clean Architecture backend, Kysely-or-Drizzle, front-end feature
folders + TanStack Query).

Goal: make the remaining stack choices, record them as ADRs (matching
the project's existing decision-journal discipline), and build the
thinnest possible full-stack vertical slice — a "walking skeleton" —
that exercises every architectural seam the specs describe, end to end,
with real tests proving it. This is sub-project 1 of a larger
decomposition (holds lifecycle, group gifts & funds, owner dashboard,
privacy/GDPR, ops & hardening, release readiness are sub-projects 2–7,
each to be brainstormed and planned separately once this one ships).

## Non-goals

- No contribution/payment flows (single-item holds only — group/fund
  items are sub-project 3).
- No owner dashboard beyond the bare create-list response (settings,
  reconciliation, thank-you tracking are sub-project 4).
- No GDPR/erasure surface, no rate limiting, no backups, no
  observability wiring beyond the Decorator seam described below —
  these are sub-projects 5–6. The seam is built now so it isn't
  retrofitted later; the actual pino/OpenTelemetry wiring is not.
- Hold expiry (ADR-002's 3-day/extend-once lifecycle) is modeled in the
  schema (`Hold.expiresAt`) but not enforced by a background process in
  this slice — that enforcement is sub-project 2.

## New ADRs (write before implementation starts)

Four stack decisions, previously left open, to record at the next free
numbers (0071–0074) following the existing Nygard template:

| # | Decision | Supersedes/narrows |
|---|---|---|
| 0071 | Fastify as the backend HTTP framework | Narrows `backend-architecture.md`'s unstated framework choice |
| 0072 | Kysely as the query builder | Narrows ADR-0012's "Kysely or Drizzle" |
| 0073 | Vite + React SPA, served by the backend process, no meta-framework | Narrows `frontend-architecture.md`'s unstated delivery model |
| 0074 | Tailwind CSS for styling | New — no prior ADR touches styling |

Each cites the rejected alternative(s) from the brainstorming
conversation (Hono/Express for 0071; Drizzle for 0072; Next.js/React
Router framework mode for 0073; CSS Modules for 0074) with the actual
reasoning already established (Pi-class resource constraints, staying
close to raw SQL for the event-sourced ledger, avoiding SSR complexity
for a mostly-client-interaction key-gated app, and utility classes
suiting a front-end newcomer better than hand-rolled CSS discipline).

## Repo layout — npm workspaces monorepo

```
apps/api/            Fastify backend
  src/domain/         Entities, value objects, domain errors. Zero imports.
  src/application/    Use cases (Command pattern) + port interfaces.
  src/infrastructure/ Kysely-backed adapters implementing those ports.
  src/presentation/   Fastify routes, zod schemas, DTO mappers, DI wiring.
  migrations/
apps/web/             Vite + React SPA
  src/api/             The one typed fetch boundary.
  src/features/        holds/, create-list/ — feature folders.
tailwind config, vitest config, playwright config
packages/shared-types/  zod schemas + inferred TS types, imported by both apps
```

Root `package.json` adds `"workspaces": ["apps/*", "packages/*"]` and
`lint`/`test`/`build` scripts that fan out to every workspace.
`.github/workflows/ci.yml`'s existing `build` job already runs
`npm run lint/test/build --if-present` at the root — no CI file change
needed for this sub-project.

At runtime, `apps/api`'s Fastify server serves `apps/web`'s built
static bundle directly: one process, one port (3000, already exposed
in `docker-compose.yml`). This matches the project's "no CDN," "ten-minute
setup" principles — no second host or build pipeline to deploy.

## The walking skeleton

One vertical slice, deliberately thin:

1. Owner visits `/`, submits a title. `CreateList` use case (a Command:
   one `execute(input)` method) generates slug/ownerToken/key via the
   `TokenGenerator` port, persists a `Wishlist` and one `single`-type
   `Item` (both built via static factory methods —
   `Wishlist.create(...)`, `Item.createSingle(...)` — enforcing
   invariants at construction, not after), and returns the owner link
   and guest link.
2. Guest opens `/{slug}`, enters the key. A session cookie is set; the
   guest sees the one item.
3. Guest clicks "Hold." A native `<dialog>` sheet (ADR-024) confirms.
   `HoldItem` appends `ItemHeld` to that item's event stream and
   updates the projection **synchronously, in the same transaction**
   (ADR-009). The guest sees the held state announced via an ARIA live
   region (ADR-025).

This exercises: the 4-layer boundary + its ESLint import-ban, the
Kysely-backed `EventStore`/repositories, the `Clock`/`TokenGenerator`
ports (real adapters in prod, fakes in tests), the one typed
`src/api/` boundary, TanStack Query for item state, and the
shared-types package breaking the front-end build on a backend rename.

## Backend: GoF patterns, applied where they earn their place

Consistent with the project's YAGNI principle — named because each has
a concrete job in this slice, not sprinkled for their own sake:

- **Adapter** — every `infrastructure/` class adapts a concrete
  technology (Kysely/SQLite, Node `crypto`) to an `application/`-defined
  port (`Clock`, `TokenGenerator`, `EventStore`, repositories). This is
  the Ports-and-Adapters shape Clean Architecture already implies;
  naming it keeps the boundary intentional as more adapters are added.
- **Command** — each use case is a Command object: one `execute(input)`
  method, input as a DTO. Matches "use case" terminology already in
  `backend-architecture.md`; this makes the shape explicit in the base
  interface both `CreateList` and `HoldItem` implement.
- **Factory Method** — domain entities expose static factories
  (`Wishlist.create(...)`, `Item.createSingle(...)`) instead of public
  constructors, so invalid states are unconstructable.
- **Builder** — test fixtures use a builder (`aWishlist().withItem(...).build()`)
  instead of long constructor argument lists, staying maintainable as
  entities grow richer in later sub-projects.
- **Decorator** — the observability seam (pino + OpenTelemetry, per
  ADR-030) wraps the base repository/event-store adapters rather than
  being baked into them. Only the seam is built now; actual
  logging/tracing wiring is sub-project 6.
- **Deliberately avoided: Singleton.** DI wiring in `presentation/`
  constructs and injects instances explicitly. Worth stating since
  Singleton is the most commonly misapplied GoF pattern, and avoiding
  it here is a choice, not an omission.
- **Forward reference — Strategy.** The natural fit is the
  `allowOverfunding` (block/warn/allow) policy, which belongs to
  sub-project 3 (group gifts & funds). Not built now; flagged so the
  pattern's reappearance later reads as planned, not improvised.

## Front-end: professional modular/testable/performant practices

Taught in place as the skeleton is built, not just documented:

- **Modular** — feature-folder boundaries enforced by lint (a feature
  cannot import another feature's internals — only `src/api/` or
  shared UI primitives). Strict container/presentational split: dumb
  components, all logic in hooks (`useHoldItem()`), already required by
  `frontend-architecture.md` — this sub-project makes the *why*
  explicit (testability seam) as we build the first one.
- **Testable** — Vitest + React Testing Library for hook/component
  tests, asserting observable behavior, not implementation. **MSW**
  (Mock Service Worker) intercepts the one API boundary in tests
  instead of ad hoc `fetch` mocking — the standard approach for testing
  TanStack-Query-driven code.
- **Performant** — route-level code-splitting via `React.lazy`
  (established now with 2 routes so the pattern is already in place
  when owner-dashboard etc. land later), tuned TanStack Query
  `staleTime` to avoid redundant refetches, and deliberately *no*
  premature `useMemo`/`useCallback` — added only where a profiler shows
  a real re-render cost. A bundle-size check ties into ADR-029's
  Pi-class performance/resource budget.

## Testing & CI

- Vitest unit tests on `domain/`/`application/`, using real fakes for
  `Clock`/`TokenGenerator` (no mocking framework).
- An integration test against real SQLite (not mocked), per
  `testing.md`.
- The ESLint layer-boundary rule (`infrastructure/*` banned from
  `domain/*`/`application/*`) wired into `lint`.
- One Playwright e2e test covering the full create → hold flow, with
  `@axe-core/playwright` scanning both pages — this is the actual
  proof of "end-to-end working software" for this slice. CI blocks
  merge on failure or on a serious/critical axe violation (ADR-026 —
  axe-core wired into e2e, CI blocks on serious/critical only).
- Front-end: Vitest + React Testing Library for `useHoldItem()` and the
  hold-sheet component, MSW for API interception.

## Definition of done

- ADRs 0071–0074 written, accepted, linked from `docs/adr/README.md`'s
  index.
- `npm run lint`, `npm test`, `npm run build` all pass at the repo
  root via workspace fan-out.
- The Playwright e2e test (create list → guest enters key → hold item →
  sees held state) passes in CI with zero serious/critical axe
  violations.
- A person can run `docker compose up -d`, open the app, create a list,
  and hold an item as a guest — the actual "ten-minute setup" principle,
  demonstrated rather than assumed.
