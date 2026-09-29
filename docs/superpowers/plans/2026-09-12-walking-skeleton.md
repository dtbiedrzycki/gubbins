# Walking Skeleton Implementation Plan

> **Amended 2026-09-29:** Tasks 11 and 13–16 (presentation, API client, and
> the three feature tests) were changed after execution by
> [the OpenAPI contract design](../specs/2026-09-29-openapi-contract-design.md)
> and [its plan](2026-09-29-openapi-contract.md): routes declare zod schemas
> that generate `apps/api/openapi.json`, and the web client and test mocks are
> typed from it. The code blocks below show the pre-amendment versions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the thinnest full-stack vertical slice of `gubbins` — owner creates a list with one single-type item, guest enters the key, guest holds the item — proving every architectural seam described in the specs works together, with real tests.

**Architecture:** Backend: Fastify + Kysely (SQLite via `better-sqlite3`) in four Clean Architecture layers (`domain/application/infrastructure/presentation`), event-sourced ledger for the one `ItemHeld` event, synchronous in-transaction projections. Front-end: Vite + React SPA (no meta-framework) served by the same Fastify process, TanStack Query for server state, Tailwind for styling, feature folders. A `packages/shared-types` workspace holds zod schemas both sides import.

**Tech Stack:** TypeScript (Node 24.17, ESM), Fastify 5, Kysely 0.27, better-sqlite3 11, zod 3, Vite 5, React 18, @tanstack/react-query 5, Tailwind 3, Vitest 2, @testing-library/react 16, msw 2, @playwright/test 1, @axe-core/playwright 4, npm workspaces (no Lerna/Nx/Turborepo — three packages don't justify the tooling).

**Spec:** `docs/superpowers/specs/2026-09-12-walking-skeleton-design.md` — this plan implements it directly; executors should have it open. ADR and spec-topic citations below (e.g. `ADR-009`, `backend-architecture.md`) are load-bearing context, not decoration.

## Global Constraints

- **Node ≥24.17**, npm workspaces (`apps/*`, `packages/*`) — no other monorepo tool.
- **Clean Architecture boundary is enforced by lint, not convention**: `domain/` and `application/` may never import `infrastructure/`. This is checked by an ESLint rule and a test, not left to review discipline.
- **Domain entities are plain classes constructed via static factory methods**, never public constructors — invalid states must be unconstructable (Factory Method pattern, per the design spec).
- **No ORM** — Kysely repositories own the SQL directly (ADR-0012).
- **Every use case is a Command**: one `execute(input): Promise<Output>` method, input as a plain object.
- **No Singleton** — the composition root (`presentation/compositionRoot.ts`) constructs every instance explicitly and passes it down; nothing reaches for a module-level shared instance.
- **`DATABASE_PATH` and `PORT` come from `.env`/`.env.example`** (already defined: `DATABASE_PATH=/workspace/data/wishlist.db`, `PORT=3000`) — don't invent new env var names for these.
- **Scope is deliberately narrow** (see the spec's Non-goals): single-item holds only, no contributions, no owner dashboard beyond the create-list response, no hold-expiry enforcement, no rate limiting, no GDPR/erasure surface, no guest-identity (`GuestPii`) capture — all deferred to later sub-projects. `Wishlist` and `Item` in this plan carry only the fields this slice needs (`title`/`slug`/`ownerToken`/`key`/`keyGen` and `title`/`type`/`quantity` respectively); later sub-projects extend them with currency, timezone, pricing, etc. — this is not an oversight, it's the walking-skeleton philosophy applied to the domain model itself.
- **One commit per task**, covering every file touched in that task.

---

## Stacked PR plan

This plan ships as a **stack of small, independently reviewable PRs**,
not one big branch. Each branch is cut from the tip of the *previous*
task's branch (not from `main`), so review of PR N can happen while
work continues on PR N+1. Merge order is bottom-up: PR 1 merges first,
then PR 2 rebases onto the post-merge base, and so on. Naming
convention: `feat/walking-skeleton/NN-slug`.

Grouping is by architectural layer, not by "is this end-to-end" — a
reviewer looking at the domain-entities PR shouldn't also have to
review HTTP wiring in the same diff. The walking skeleton's own
end-to-end promise is a property of the *finished stack*, checked once
in PR 16's Definition-of-Done sweep, not of every individual PR.

| PR | Branch | Tasks | What a reviewer is approving |
|----|--------|-------|-------------------------------|
| 1 | `feat/walking-skeleton/01-adrs` | 1 | Four stack-decision ADRs — docs only, no code |
| 2 | `feat/walking-skeleton/02-monorepo` | 2, 3 | Workspace scaffolding, layer-boundary lint, shared zod schemas |
| 3 | `feat/walking-skeleton/03-domain` | 4 | `Wishlist`/`Item`/`Hold` entities + `ItemHeld` event |
| 4 | `feat/walking-skeleton/04-ports` | 5 | Application ports + test fakes |
| 5 | `feat/walking-skeleton/05-create-and-key` | 6, 7 | `CreateList` + `EnterGuestKey` use cases |
| 6 | `feat/walking-skeleton/06-hold-item` | 8 | `HoldItem` use case — the core ledger-write path, isolated for focused review |
| 7 | `feat/walking-skeleton/07-persistence` | 9 | SQLite schema/migration + Kysely adapters |
| 8 | `feat/walking-skeleton/08-crypto-and-observability` | 10 | Crypto adapters + `LoggingEventStore` decorator |
| 9 | `feat/walking-skeleton/09-presentation` | 11 | Fastify app, DI wiring, routes — **backend is runnable end-to-end via HTTP after this PR** |
| 10 | `feat/walking-skeleton/10-web-scaffold` | 12 | Vite + React + Tailwind scaffold |
| 11 | `feat/walking-skeleton/11-api-client` | 13 | Typed fetch boundary + MSW test setup |
| 12 | `feat/walking-skeleton/12-create-list-ui` | 14 | Create-list feature |
| 13 | `feat/walking-skeleton/13-guest-key-ui` | 15 | Guest key-gate feature |
| 14 | `feat/walking-skeleton/14-holds-ui` | 16 | Holds feature (item view, dialog, ARIA live region) |
| 15 | `feat/walking-skeleton/15-wire-it-together` | 17 | Routing, static serving, workspace script fan-out — **app is usable end-to-end in a browser after this PR** |
| 16 | `feat/walking-skeleton/16-e2e-and-verification` | 18, 19 | Playwright + axe-core e2e test, Definition-of-Done sweep |

**Mechanics:** at the start of the first task in each PR row, branch
with `git checkout -b <this-row's-branch> <previous-row's-branch>`
(row 1 branches off `main`). Every task's own "Commit" step is a commit
*within* that PR's branch — a PR spanning multiple tasks (rows 2, 5,
16) ends up with that many commits, not squashed. Open the PR with
base = the previous row's branch, not `main`, so the diff shown for
review is only that row's tasks. When a PR merges, rebase the next
branch in the stack onto the new tip of its base before continuing
work on it. Every commit still needs a valid SSH signature
(`.allowed_signers`) regardless of which branch it lands on — nothing
about stacking changes that.

---

## Task 1: Record stack ADRs 0071–0074

**Branch:** `feat/walking-skeleton/01-adrs`, off `main`.

The four stack decisions made during brainstorming (Fastify, Kysely, Vite+React SPA, Tailwind) get recorded the same way every other decision in this project has been — as Nygard-template ADRs — before any code depending on them is written.

**Files:**
- Create: `docs/adr/0071-fastify-as-the-backend-http-framework.md`
- Create: `docs/adr/0072-kysely-as-the-query-builder.md`
- Create: `docs/adr/0073-vite-react-spa-served-by-the-backend.md`
- Create: `docs/adr/0074-tailwind-css-for-styling.md`
- Modify: `docs/adr/README.md` (index table + this plan doesn't touch the "Imported ADRs" section, which is specifically about the 0001–0070 import — add a short new sentence noting 0071 onward are repo-native, written directly as decisions are made, not imported)

**Interfaces:** none — these are documentation-only, consumed by every later task as citations.

- [ ] **Step 1: Write ADR-0071 (Fastify)**

```markdown
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
```

- [ ] **Step 2: Write ADR-0072 (Kysely)**

```markdown
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
```

- [ ] **Step 3: Write ADR-0073 (Vite + React SPA)**

```markdown
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
```

- [ ] **Step 4: Write ADR-0074 (Tailwind)**

```markdown
# 0074. Tailwind CSS for styling

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** dtbiedrzycki

## Context

No prior ADR or spec topic addresses styling. The front-end is being
built by a contributor newer to front-end work than back-end, which
matters for which approach is easier to learn and stay consistent in
across many small feature-folder components ([front-end architecture](../spec/frontend-architecture.md)).

## Decision

We will use Tailwind CSS for styling, compiled at build time via
PostCSS (no CDN `<script>` include, consistent with the project's
no-outbound-requests-at-runtime principle).

## Alternatives considered

- **CSS Modules with plain CSS** — rejected for this project: more
  traditional and requires no new vocabulary, but leaves consistency
  across features to individual discipline (no shared spacing/color
  scale enforced by tooling), and separates markup from the styles that
  apply to it across two files per component.

## Consequences

- Utility classes live directly in JSX; there is no per-component
  `.module.css` file to keep in sync with markup changes.
- A `tailwind.config.js` at `apps/web/` defines the design tokens
  (spacing, color) once, giving later features a consistent scale to
  draw from rather than ad hoc values.
```

- [ ] **Step 5: Update the ADR index**

In `docs/adr/README.md`, add four rows to the Index table immediately
after the `070` row:

```
| [071](0071-fastify-as-the-backend-http-framework.md) | Fastify as the backend HTTP framework | Accepted |
| [072](0072-kysely-as-the-query-builder.md) | Kysely as the query builder | Accepted |
| [073](0073-vite-react-spa-served-by-the-backend.md) | Vite + React SPA, served by the backend | Accepted |
| [074](0074-tailwind-css-for-styling.md) | Tailwind CSS for styling | Accepted |
```

Then, immediately after the existing "Imported ADRs (0001–0070)"
section, add:

```markdown
ADRs 0071 onward are repo-native: written directly as each decision is
made during implementation, not imported from `gubbins-spec.md`.
```

- [ ] **Step 6: Run the link checker**

```bash
python3 scripts/check_adr_links.py
```

Expected: `All links resolve.` (This script already exists from the
ADR-rollout work on the `docs/adr-rollout` branch — if this plan is
executed from a branch that doesn't have it yet, merge `main` first;
it's expected to have landed by the time this plan runs.)

- [ ] **Step 7: Commit**

```bash
git add docs/adr/0071-fastify-as-the-backend-http-framework.md \
        docs/adr/0072-kysely-as-the-query-builder.md \
        docs/adr/0073-vite-react-spa-served-by-the-backend.md \
        docs/adr/0074-tailwind-css-for-styling.md \
        docs/adr/README.md
git commit -m "docs(adr): record stack decisions for the walking skeleton (0071-0074)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 2: Monorepo scaffolding — npm workspaces, tooling, layer-boundary lint

**Branch:** `feat/walking-skeleton/02-monorepo`, off `feat/walking-skeleton/01-adrs` (this task and Task 3 share this branch/PR).

**Files:**
- Modify: `package.json` (root — add `workspaces`, fan-out scripts)
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/web/package.json` (placeholder deps; Task 12 runs the real Vite scaffold)
- Create: `packages/shared-types/package.json`, `packages/shared-types/tsconfig.json`
- Create: `apps/api/eslint.config.js`
- Test: `apps/api/src/eslint-boundary.test.ts`

**Interfaces:**
- Produces: the `npm run lint|test|build --workspaces --if-present` fan-out every later task's verification commands assume.

- [ ] **Step 1: Add workspaces to the root `package.json`**

Modify `package.json`: add `"workspaces": ["apps/*", "packages/*"]` and replace the `scripts` block with:

```json
"scripts": {
  "test": "bats scripts/test && npm run test --workspaces --if-present",
  "lint": "npm run lint --workspaces --if-present",
  "build": "npm run build --workspaces --if-present"
}
```

(The existing `bats scripts/test` stays — it covers `scripts/verify-signatures.sh` etc., unrelated to the app workspaces.)

- [ ] **Step 2: Add a shared base tsconfig**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Scaffold `packages/shared-types`**

Create `packages/shared-types/package.json`:

```json
{
  "name": "@gubbins/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.2",
    "vitest": "^2.1.1",
    "eslint": "^9.11.1"
  }
}
```

Create `packages/shared-types/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/shared-types/src/index.ts` (empty placeholder — Task 3 fills this in):

```ts
export {};
```

- [ ] **Step 4: Scaffold `apps/api`**

Create `apps/api/package.json`:

```json
{
  "name": "@gubbins/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src",
    "test": "vitest run",
    "migrate": "tsx src/infrastructure/db/migrate.ts",
    "dev": "tsx watch src/presentation/server.ts"
  },
  "dependencies": {
    "@gubbins/shared-types": "*",
    "fastify": "^5.0.0",
    "@fastify/cookie": "^10.0.1",
    "@fastify/static": "^8.0.1",
    "kysely": "^0.27.4",
    "better-sqlite3": "^11.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.2",
    "vitest": "^2.1.1",
    "eslint": "^9.11.1",
    "@typescript-eslint/eslint-plugin": "^8.7.0",
    "@typescript-eslint/parser": "^8.7.0",
    "tsx": "^4.19.1",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.7.4"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Write the ESLint layer-boundary rule**

Create `apps/api/eslint.config.js`:

```js
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/infrastructure/*', '**/infrastructure'], message: 'domain/ and application/ may not import infrastructure/ (Clean Architecture boundary, ADR-012).' }] },
      ],
    },
  },
];
```

- [ ] **Step 6: Write a failing test proving the rule catches a violation**

Create `apps/api/src/eslint-boundary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

describe('Clean Architecture layer boundary', () => {
  it('flags an infrastructure import from domain', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { db } from '../infrastructure/db/createDb';\nexport const x = db;\n",
      { filePath: 'src/domain/entities/Bad.ts' },
    );
    const messages = results[0].messages;
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows the same import from presentation', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { db } from '../infrastructure/db/createDb';\nexport const x = db;\n",
      { filePath: 'src/presentation/compositionRoot.ts' },
    );
    const messages = results[0].messages;
    expect(messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
});
```

This test can't fail-then-pass in the usual TDD sense (there's no
production code to write — the ESLint config *is* the implementation),
so run it once now to prove the config is correct:

```bash
cd apps/api && npx vitest run src/eslint-boundary.test.ts
```

Expected: both assertions pass. If the first one fails, the glob
pattern in Step 5 is wrong — fix it before continuing; every domain/
application task after this one relies on this rule actually working.

- [ ] **Step 7: Placeholder `apps/web/package.json`**

Task 12 replaces this with the real `npm create vite@latest` output;
for now it only needs to exist so `npm install` at the root resolves
all three workspaces without error:

```json
{
  "name": "@gubbins/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "echo 'apps/web not yet scaffolded — see Task 12' && exit 0",
    "lint": "echo 'apps/web not yet scaffolded — see Task 12' && exit 0",
    "test": "echo 'apps/web not yet scaffolded — see Task 12' && exit 0"
  }
}
```

- [ ] **Step 8: Install and verify**

```bash
npm install
npm run lint --workspaces --if-present
npm run test --workspaces --if-present
```

Expected: install succeeds across all three workspaces; lint passes
(no source files to lint yet in `apps/api`/`shared-types` beyond the
test file, which itself must pass lint); the boundary test from Step 6
passes.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json apps/api/package.json \
        apps/api/tsconfig.json apps/api/eslint.config.js apps/api/src/eslint-boundary.test.ts \
        apps/web/package.json packages/shared-types/package.json \
        packages/shared-types/tsconfig.json packages/shared-types/src/index.ts
git commit -m "chore: scaffold npm workspaces monorepo with layer-boundary lint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 3: `packages/shared-types` — zod schemas for the four API operations

**Branch:** same as Task 2 — `feat/walking-skeleton/02-monorepo`.

**Files:**
- Create: `packages/shared-types/src/createList.ts`
- Create: `packages/shared-types/src/enterGuestKey.ts`
- Create: `packages/shared-types/src/holdItem.ts`
- Create: `packages/shared-types/src/listView.ts`
- Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/createList.test.ts` (representative — same pattern covers the other three)

**Interfaces:**
- Produces: `createListRequestSchema`, `createListResponseSchema`, `enterGuestKeyRequestSchema`, `enterGuestKeyResponseSchema`, `holdItemRequestSchema`, `holdItemResponseSchema`, `listViewResponseSchema`, and their inferred types `CreateListRequest`, `CreateListResponse`, `EnterGuestKeyRequest`, `EnterGuestKeyResponse`, `HoldItemRequest`, `HoldItemResponse`, `ListViewResponse` — imported by both `apps/api/src/presentation/` and `apps/web/src/api/`.

- [ ] **Step 1: Write the failing test for the `createList` schema**

Create `packages/shared-types/src/createList.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createListRequestSchema, createListResponseSchema } from './createList';

describe('createListRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty listTitle', () => {
    const result = createListRequestSchema.safeParse({ listTitle: '', itemTitle: 'Stroller' });
    expect(result.success).toBe(false);
  });

  it('rejects a listTitle over 120 characters', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'a'.repeat(121), itemTitle: 'Stroller' });
    expect(result.success).toBe(false);
  });
});

describe('createListResponseSchema', () => {
  it('accepts a valid response', () => {
    const result = createListResponseSchema.safeParse({
      slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1',
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd packages/shared-types && npx vitest run src/createList.test.ts
```

Expected: FAIL — `./createList` does not exist yet.

- [ ] **Step 3: Implement the `createList` schemas**

Create `packages/shared-types/src/createList.ts`:

```ts
import { z } from 'zod';

export const createListRequestSchema = z.object({
  listTitle: z.string().trim().min(1).max(120),
  itemTitle: z.string().trim().min(1).max(120),
});
export type CreateListRequest = z.infer<typeof createListRequestSchema>;

export const createListResponseSchema = z.object({
  slug: z.string(),
  ownerToken: z.string(),
  key: z.string(),
  itemId: z.string(),
});
export type CreateListResponse = z.infer<typeof createListResponseSchema>;
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
cd packages/shared-types && npx vitest run src/createList.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement the remaining three schema files (same pattern, no separate test files — `createList.test.ts` already establishes the pattern is correct; these are validated by the use-case and route tests in later tasks that import them)**

Create `packages/shared-types/src/enterGuestKey.ts`:

```ts
import { z } from 'zod';

export const enterGuestKeyRequestSchema = z.object({
  key: z.string().trim().min(1),
});
export type EnterGuestKeyRequest = z.infer<typeof enterGuestKeyRequestSchema>;

export const enterGuestKeyResponseSchema = z.object({
  ok: z.literal(true),
});
export type EnterGuestKeyResponse = z.infer<typeof enterGuestKeyResponseSchema>;
```

Create `packages/shared-types/src/holdItem.ts`:

```ts
import { z } from 'zod';

export const holdItemRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1),
});
export type HoldItemRequest = z.infer<typeof holdItemRequestSchema>;

export const holdItemResponseSchema = z.object({
  holdId: z.string(),
  itemId: z.string(),
  expiresAt: z.string(),
});
export type HoldItemResponse = z.infer<typeof holdItemResponseSchema>;
```

Create `packages/shared-types/src/listView.ts`:

```ts
import { z } from 'zod';

export const itemStatusSchema = z.enum(['available', 'held']);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const listViewResponseSchema = z.object({
  title: z.string(),
  item: z.object({
    id: z.string(),
    title: z.string(),
    status: itemStatusSchema,
  }),
});
export type ListViewResponse = z.infer<typeof listViewResponseSchema>;
```

- [ ] **Step 6: Re-export everything from the package entrypoint**

Replace the contents of `packages/shared-types/src/index.ts`:

```ts
export * from './createList';
export * from './enterGuestKey';
export * from './holdItem';
export * from './listView';
```

- [ ] **Step 7: Run the full package test suite and build**

```bash
cd packages/shared-types && npx vitest run && npx tsc -p tsconfig.json
```

Expected: all tests pass; `tsc` emits no errors and produces `dist/`.

- [ ] **Step 8: Commit**

```bash
git add packages/shared-types/src
git commit -m "feat(shared-types): add zod schemas for create-list, guest-key, hold, and list-view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 4: Backend domain layer — entities and the `ItemHeld` event

Every entity is constructed via a static factory method (Factory Method
pattern) so an invalid `Wishlist`, `Item`, or `Hold` can never exist —
not "gets validated," but is structurally unconstructable.

**Branch:** `feat/walking-skeleton/03-domain`, off `feat/walking-skeleton/02-monorepo`.

**Files:**
- Create: `apps/api/src/domain/errors.ts`
- Create: `apps/api/src/domain/entities/Wishlist.ts`
- Create: `apps/api/src/domain/entities/Item.ts`
- Create: `apps/api/src/domain/entities/Hold.ts`
- Create: `apps/api/src/domain/events/ItemHeldEvent.ts`
- Test: `apps/api/src/domain/entities/Wishlist.test.ts`
- Test: `apps/api/src/domain/entities/Item.test.ts`
- Test: `apps/api/src/domain/entities/Hold.test.ts`

**Interfaces:**
- Produces: `Wishlist.create(props)`, `Item.createSingle(props)`, `Hold.create(props)` factories and the `ItemHeldEvent` type — consumed by the application-layer use cases in Tasks 6–8.

- [ ] **Step 1: Write the failing test for `Wishlist`**

Create `apps/api/src/domain/entities/Wishlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Wishlist } from './Wishlist';
import { DomainValidationError } from '../errors';

describe('Wishlist.create', () => {
  const validProps = { id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };

  it('creates a wishlist with keyGen starting at 1', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.id).toBe('w1');
    expect(wishlist.slug).toBe('abc123');
    expect(wishlist.title).toBe('Baby Shower');
    expect(wishlist.keyGen).toBe(1);
  });

  it('trims the title', () => {
    const wishlist = Wishlist.create({ ...validProps, title: '  Baby Shower  ' });
    expect(wishlist.title).toBe('Baby Shower');
  });

  it('rejects an empty title', () => {
    expect(() => Wishlist.create({ ...validProps, title: '   ' })).toThrow(DomainValidationError);
  });

  it('rejects a title over 120 characters', () => {
    expect(() => Wishlist.create({ ...validProps, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/domain/entities/Wishlist.test.ts
```

Expected: FAIL — `./Wishlist` and `../errors` don't exist yet.

- [ ] **Step 3: Implement `errors.ts` and `Wishlist.ts`**

Create `apps/api/src/domain/errors.ts`:

```ts
export class DomainValidationError extends Error {}
export class ItemNotFoundError extends Error {
  constructor(itemId: string) { super(`Item not found: ${itemId}`); }
}
export class WishlistNotFoundError extends Error {}
export class ItemAlreadyHeldError extends Error {
  constructor(itemId: string) { super(`Item already held: ${itemId}`); }
}
export class InvalidGuestKeyError extends Error {}
export class ConcurrencyError extends Error {
  constructor(itemId: string, expectedSeq: number, actualSeq: number) {
    super(`Concurrency conflict on item ${itemId}: expected seq ${expectedSeq}, actual ${actualSeq}`);
  }
}
```

Create `apps/api/src/domain/entities/Wishlist.ts`:

```ts
import { DomainValidationError } from '../errors';

export class Wishlist {
  private constructor(
    readonly id: string,
    readonly slug: string,
    readonly title: string,
    readonly ownerToken: string,
    readonly key: string,
    readonly keyGen: number,
  ) {}

  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string }): Wishlist {
    const title = props.title.trim();
    if (title.length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
    return new Wishlist(props.id, props.slug, title, props.ownerToken, props.key, 1);
  }

  /** Reconstructs a Wishlist from persisted fields — used by repositories, not by application-layer creation flows. */
  static reconstitute(props: { id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number }): Wishlist {
    return new Wishlist(props.id, props.slug, props.title, props.ownerToken, props.key, props.keyGen);
  }
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/domain/entities/Wishlist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing test for `Item`**

Create `apps/api/src/domain/entities/Item.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Item } from './Item';
import { DomainValidationError } from '../errors';

describe('Item.createSingle', () => {
  it('creates a single-type item with quantity 1', () => {
    const item = Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(1);
    expect(item.title).toBe('Stroller');
  });

  it('rejects an empty title', () => {
    expect(() => Item.createSingle({ id: 'i1', wishlistId: 'w1', title: '  ' })).toThrow(DomainValidationError);
  });
});
```

- [ ] **Step 6: Run it, confirm it fails, then implement `Item.ts`**

```bash
cd apps/api && npx vitest run src/domain/entities/Item.test.ts
```

Expected: FAIL. Then create `apps/api/src/domain/entities/Item.ts`:

```ts
import { DomainValidationError } from '../errors';

export class Item {
  private constructor(
    readonly id: string,
    readonly wishlistId: string,
    readonly type: 'single',
    readonly title: string,
    readonly quantity: number,
  ) {}

  static createSingle(props: { id: string; wishlistId: string; title: string }): Item {
    const title = props.title.trim();
    if (title.length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
    return new Item(props.id, props.wishlistId, 'single', title, 1);
  }

  /** Reconstructs an Item from persisted fields. */
  static reconstitute(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(props.id, props.wishlistId, 'single', props.title, 1);
  }
}
```

Run again and confirm PASS.

- [ ] **Step 7: Write the failing test for `Hold`**

Create `apps/api/src/domain/entities/Hold.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Hold } from './Hold';
import { DomainValidationError } from '../errors';

describe('Hold.create', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const validProps = {
    id: 'h1', itemId: 'i1', secret: 'hold-secret', sessionHash: 'session-hash',
    idempotencyKey: 'idem-1', expiresAt: new Date('2026-01-04T00:00:00Z'), now,
  };

  it('creates a hold', () => {
    const hold = Hold.create(validProps);
    expect(hold.id).toBe('h1');
    expect(hold.expiresAt).toEqual(validProps.expiresAt);
  });

  it('rejects an empty secret', () => {
    expect(() => Hold.create({ ...validProps, secret: '' })).toThrow(DomainValidationError);
  });

  it('rejects an expiresAt that is not in the future relative to now', () => {
    expect(() => Hold.create({ ...validProps, expiresAt: now })).toThrow(DomainValidationError);
  });
});
```

- [ ] **Step 8: Run it, confirm it fails, then implement `Hold.ts`**

```bash
cd apps/api && npx vitest run src/domain/entities/Hold.test.ts
```

Expected: FAIL. Then create `apps/api/src/domain/entities/Hold.ts`:

```ts
import { DomainValidationError } from '../errors';

export class Hold {
  private constructor(
    readonly id: string,
    readonly itemId: string,
    readonly secret: string,
    readonly sessionHash: string,
    readonly idempotencyKey: string,
    readonly expiresAt: Date,
  ) {}

  static create(props: {
    id: string; itemId: string; secret: string; sessionHash: string;
    idempotencyKey: string; expiresAt: Date; now: Date;
  }): Hold {
    if (props.secret.length === 0) throw new DomainValidationError('Hold secret must not be empty');
    if (props.expiresAt.getTime() <= props.now.getTime()) {
      throw new DomainValidationError('Hold expiresAt must be in the future');
    }
    return new Hold(props.id, props.itemId, props.secret, props.sessionHash, props.idempotencyKey, props.expiresAt);
  }
}
```

Run again and confirm PASS.

- [ ] **Step 9: Add the `ItemHeldEvent` type (no test — a plain data shape, exercised by Task 8's use-case tests)**

Create `apps/api/src/domain/events/ItemHeldEvent.ts`:

```ts
export interface ItemHeldEvent {
  type: 'ItemHeld';
  itemId: string;
  holdId: string;
  secret: string;
  sessionHash: string;
  idempotencyKey: string;
  expiresAt: string; // ISO 8601
  occurredAt: string; // ISO 8601
}
```

- [ ] **Step 10: Run the full domain test suite and lint**

```bash
cd apps/api && npx vitest run src/domain && npx eslint src/domain
```

Expected: all tests pass; lint reports no errors (in particular, no
`no-restricted-imports` violation, since nothing here imports
`infrastructure/`).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/domain
git commit -m "feat(api): add domain entities (Wishlist, Item, Hold) and the ItemHeld event

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 5: Application ports and test fakes

Ports are the Adapter pattern's other half — application code depends
only on these interfaces, never on `infrastructure/`. This task also
builds the fakes used by every use-case unit test in Tasks 6–8 (real
adapters come in Task 9).

**Branch:** `feat/walking-skeleton/04-ports`, off `feat/walking-skeleton/03-domain`.

**Files:**
- Create: `apps/api/src/application/ports/Clock.ts`
- Create: `apps/api/src/application/ports/TokenGenerator.ts`
- Create: `apps/api/src/application/ports/SecretComparer.ts`
- Create: `apps/api/src/application/ports/Hasher.ts`
- Create: `apps/api/src/application/ports/Logger.ts`
- Create: `apps/api/src/application/ports/EventStore.ts`
- Create: `apps/api/src/application/ports/WishlistRepository.ts`
- Create: `apps/api/src/application/ports/ItemRepository.ts`
- Create: `apps/api/src/application/ports/HoldRepository.ts`
- Create: `apps/api/src/application/ports/UnitOfWork.ts`
- Create: `apps/api/src/application/test-fakes/FixedClock.ts`
- Create: `apps/api/src/application/test-fakes/SequentialTokenGenerator.ts`
- Create: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Test: `apps/api/src/application/test-fakes/FixedClock.test.ts`
- Test: `apps/api/src/application/test-fakes/SequentialTokenGenerator.test.ts`

**Interfaces:**
- Consumes: nothing (this is the innermost application-layer definition point besides domain).
- Produces: every port interface and fake listed above — consumed directly by Tasks 6–8's use cases and their tests, and implemented for real by Task 9's infrastructure adapters.

- [ ] **Step 1: Write the port interfaces (no tests — pure type declarations, exercised indirectly by every later task)**

Create `apps/api/src/application/ports/Clock.ts`:

```ts
export interface Clock {
  now(): Date;
}
```

Create `apps/api/src/application/ports/TokenGenerator.ts`:

```ts
export interface TokenGenerator {
  generateId(): string;
  generateSlug(): string;
  generateOwnerToken(): string;
  generateGuestKey(): string;
  generateHoldSecret(): string;
  generateSessionId(): string;
}
```

Create `apps/api/src/application/ports/SecretComparer.ts`:

```ts
export interface SecretComparer {
  constantTimeEqual(a: string, b: string): boolean;
}
```

Create `apps/api/src/application/ports/Hasher.ts`:

```ts
export interface Hasher {
  hash(value: string): string;
}
```

Create `apps/api/src/application/ports/Logger.ts`:

```ts
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
}
```

Create `apps/api/src/application/ports/EventStore.ts`:

```ts
export interface DomainEvent {
  type: string;
  occurredAt: string;
  [key: string]: unknown;
}

export interface EventStore {
  /** Appends events to itemId's stream. Throws ConcurrencyError if the stream's current seq !== expectedSeq. */
  append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void>;
}
```

Create `apps/api/src/application/ports/WishlistRepository.ts`:

```ts
import type { Wishlist } from '../../domain/entities/Wishlist';

export interface WishlistRepository {
  insert(wishlist: Wishlist): Promise<void>;
  findBySlug(slug: string): Promise<Wishlist | null>;
}
```

Create `apps/api/src/application/ports/ItemRepository.ts`:

```ts
import type { Item } from '../../domain/entities/Item';

export interface ItemState {
  seq: number;
  activeHolds: number;
  status: 'available' | 'held';
}

export interface ItemRepository {
  insert(item: Item): Promise<void>;
  findById(id: string): Promise<Item | null>;
  findByWishlistId(wishlistId: string): Promise<Item | null>;
  getState(itemId: string): Promise<ItemState>;
  markHeld(itemId: string, newSeq: number): Promise<void>;
}
```

Create `apps/api/src/application/ports/HoldRepository.ts`:

```ts
export interface HoldRecord {
  id: string;
  itemId: string;
  secret: string;
  sessionHash: string;
  idempotencyKey: string;
  expiresAt: Date;
}

export interface HoldRepository {
  recordHold(hold: HoldRecord): Promise<void>;
  findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<HoldRecord | null>;
}
```

Create `apps/api/src/application/ports/UnitOfWork.ts`:

```ts
import type { WishlistRepository } from './WishlistRepository';
import type { ItemRepository } from './ItemRepository';
import type { HoldRepository } from './HoldRepository';
import type { EventStore } from './EventStore';

export interface TransactionContext {
  wishlists: WishlistRepository;
  items: ItemRepository;
  holds: HoldRepository;
  eventStore: EventStore;
}

export interface UnitOfWork {
  execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 2: Write the failing test for `FixedClock`**

Create `apps/api/src/application/test-fakes/FixedClock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FixedClock } from './FixedClock';

describe('FixedClock', () => {
  it('returns the injected time', () => {
    const fixed = new Date('2026-01-01T00:00:00Z');
    const clock = new FixedClock(fixed);
    expect(clock.now()).toEqual(fixed);
  });

  it('advance() moves the clock forward by the given milliseconds', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    clock.advance(1000);
    expect(clock.now()).toEqual(new Date('2026-01-01T00:00:01Z'));
  });
});
```

- [ ] **Step 3: Run it, confirm it fails, then implement `FixedClock.ts`**

```bash
cd apps/api && npx vitest run src/application/test-fakes/FixedClock.test.ts
```

Expected: FAIL. Then create `apps/api/src/application/test-fakes/FixedClock.ts`:

```ts
import type { Clock } from '../ports/Clock';

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
```

Run again and confirm PASS.

- [ ] **Step 4: Write the failing test for `SequentialTokenGenerator`**

Create `apps/api/src/application/test-fakes/SequentialTokenGenerator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SequentialTokenGenerator } from './SequentialTokenGenerator';

describe('SequentialTokenGenerator', () => {
  it('produces distinct, predictable values per call, incrementing a shared counter', () => {
    const gen = new SequentialTokenGenerator();
    expect(gen.generateId()).toBe('id-1');
    expect(gen.generateId()).toBe('id-2');
    expect(gen.generateSlug()).toBe('slug-3');
    expect(gen.generateOwnerToken()).toBe('owner-token-4');
    expect(gen.generateGuestKey()).toBe('guest-key-5');
    expect(gen.generateHoldSecret()).toBe('hold-secret-6');
    expect(gen.generateSessionId()).toBe('session-7');
  });
});
```

- [ ] **Step 5: Run it, confirm it fails, then implement `SequentialTokenGenerator.ts`**

```bash
cd apps/api && npx vitest run src/application/test-fakes/SequentialTokenGenerator.test.ts
```

Expected: FAIL. Then create `apps/api/src/application/test-fakes/SequentialTokenGenerator.ts`:

```ts
import type { TokenGenerator } from '../ports/TokenGenerator';

export class SequentialTokenGenerator implements TokenGenerator {
  private counter = 0;

  private next(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  generateId(): string { return this.next('id'); }
  generateSlug(): string { return this.next('slug'); }
  generateOwnerToken(): string { return this.next('owner-token'); }
  generateGuestKey(): string { return this.next('guest-key'); }
  generateHoldSecret(): string { return this.next('hold-secret'); }
  generateSessionId(): string { return this.next('session'); }
}
```

Run again and confirm PASS.

- [ ] **Step 6: Implement the in-memory repositories and unit-of-work (tested indirectly through Tasks 6–8's use-case tests, which exercise every method — no separate test file here to avoid duplicating those assertions)**

Create `apps/api/src/application/test-fakes/InMemoryRepositories.ts`:

```ts
import type { Wishlist } from '../../domain/entities/Wishlist';
import type { Item } from '../../domain/entities/Item';
import type { WishlistRepository } from '../ports/WishlistRepository';
import type { ItemRepository, ItemState } from '../ports/ItemRepository';
import type { HoldRepository, HoldRecord } from '../ports/HoldRepository';
import type { EventStore, DomainEvent } from '../ports/EventStore';
import type { UnitOfWork, TransactionContext } from '../ports/UnitOfWork';
import { ConcurrencyError } from '../../domain/errors';

export class InMemoryWishlistRepository implements WishlistRepository {
  private bySlug = new Map<string, Wishlist>();

  async insert(wishlist: Wishlist): Promise<void> {
    this.bySlug.set(wishlist.slug, wishlist);
  }

  async findBySlug(slug: string): Promise<Wishlist | null> {
    return this.bySlug.get(slug) ?? null;
  }
}

export class InMemoryItemRepository implements ItemRepository {
  private byId = new Map<string, Item>();
  private states = new Map<string, ItemState>();

  async insert(item: Item): Promise<void> {
    this.byId.set(item.id, item);
    this.states.set(item.id, { seq: 0, activeHolds: 0, status: 'available' });
  }

  async findById(id: string): Promise<Item | null> {
    return this.byId.get(id) ?? null;
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    for (const item of this.byId.values()) {
      if (item.wishlistId === wishlistId) return item;
    }
    return null;
  }

  async getState(itemId: string): Promise<ItemState> {
    const state = this.states.get(itemId);
    if (!state) throw new Error(`No state for item ${itemId}`);
    return state;
  }

  async markHeld(itemId: string, newSeq: number): Promise<void> {
    const state = this.states.get(itemId);
    if (!state) throw new Error(`No state for item ${itemId}`);
    this.states.set(itemId, { seq: newSeq, activeHolds: state.activeHolds + 1, status: 'held' });
  }
}

export class InMemoryHoldRepository implements HoldRepository {
  private holds: HoldRecord[] = [];

  async recordHold(hold: HoldRecord): Promise<void> {
    this.holds.push(hold);
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<HoldRecord | null> {
    return this.holds.find((h) => h.itemId === itemId && h.idempotencyKey === idempotencyKey) ?? null;
  }
}

export class InMemoryEventStore implements EventStore {
  private streams = new Map<string, DomainEvent[]>();

  async append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void> {
    const stream = this.streams.get(itemId) ?? [];
    if (stream.length !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, stream.length);
    }
    this.streams.set(itemId, [...stream, ...events]);
  }
}

/** No real transactionality — fine for use-case unit tests, which never assert rollback behavior; Task 9's integration tests cover that against real SQLite. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private ctx: TransactionContext) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return fn(this.ctx);
  }
}
```

- [ ] **Step 7: Add the `aWishlist()`/`anItem()` test-fixture builders**

The Builder pattern, applied where it earns its place: sensible
defaults for every field, overridable one at a time, instead of long
positional-ish constructor-argument objects repeated across every test
file. Its value grows with Task 8 onward, where fixtures start needing
more field combinations.

Create `apps/api/src/application/test-fakes/builders.ts`:

```ts
import { Wishlist } from '../../domain/entities/Wishlist';
import { Item } from '../../domain/entities/Item';

export class WishlistBuilder {
  private props = { id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };

  withId(id: string): this { this.props.id = id; return this; }
  withSlug(slug: string): this { this.props.slug = slug; return this; }
  withTitle(title: string): this { this.props.title = title; return this; }
  withOwnerToken(ownerToken: string): this { this.props.ownerToken = ownerToken; return this; }
  withKey(key: string): this { this.props.key = key; return this; }

  build(): Wishlist {
    return Wishlist.create({ ...this.props });
  }
}

export function aWishlist(): WishlistBuilder {
  return new WishlistBuilder();
}

export class ItemBuilder {
  private props = { id: 'item-1', wishlistId: 'w1', title: 'Stroller' };

  withId(id: string): this { this.props.id = id; return this; }
  withWishlistId(wishlistId: string): this { this.props.wishlistId = wishlistId; return this; }
  withTitle(title: string): this { this.props.title = title; return this; }

  build(): Item {
    return Item.createSingle({ ...this.props });
  }
}

export function anItem(): ItemBuilder {
  return new ItemBuilder();
}
```

Add a test proving the defaults and overrides both work — create
`apps/api/src/application/test-fakes/builders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aWishlist, anItem } from './builders';

describe('aWishlist', () => {
  it('builds a Wishlist with sensible defaults, overridable per field', () => {
    const wishlist = aWishlist().withTitle('Custom Title').build();
    expect(wishlist.title).toBe('Custom Title');
    expect(wishlist.slug).toBe('abc123'); // default, not overridden
  });
});

describe('anItem', () => {
  it('builds an Item with sensible defaults, overridable per field', () => {
    const item = anItem().withTitle('Custom Item').build();
    expect(item.title).toBe('Custom Item');
    expect(item.wishlistId).toBe('w1'); // default, not overridden
  });
});
```

Run it:

```bash
cd apps/api && npx vitest run src/application/test-fakes/builders.test.ts
```

Expected: PASS, both cases. (Task 8's `HoldItem` tests are the first
consumer of `anItem()` — see that task's `seedItem` helper.)

- [ ] **Step 8: Run the full application test suite and lint**

```bash
cd apps/api && npx vitest run src/application && npx eslint src/application
```

Expected: all tests pass; lint reports no errors, including no
`no-restricted-imports` violations (nothing here imports
`infrastructure/`).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/application
git commit -m "feat(api): add application ports, test fakes, and the aWishlist/anItem fixture builders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 6: `CreateList` use case

The first Command: one `execute(input): Promise<Output>` method,
input as a plain object.

**Branch:** `feat/walking-skeleton/05-create-and-key`, off `feat/walking-skeleton/04-ports` (this task and Task 7 share this branch/PR).

**Files:**
- Create: `apps/api/src/application/use-cases/CreateList.ts`
- Test: `apps/api/src/application/use-cases/CreateList.test.ts`

**Interfaces:**
- Consumes: `UnitOfWork`/`TransactionContext` (Task 5), `TokenGenerator` (Task 5), `Wishlist.create`/`Item.createSingle` (Task 4).
- Produces: `CreateList` class with `execute({ listTitle, itemTitle }): Promise<{ slug: string; ownerToken: string; key: string; itemId: string }>` — consumed by Task 11's presentation route.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/application/use-cases/CreateList.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CreateList } from './CreateList';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator';
import {
  InMemoryWishlistRepository, InMemoryItemRepository, InMemoryHoldRepository,
  InMemoryEventStore, InMemoryUnitOfWork,
} from '../test-fakes/InMemoryRepositories';

function makeUseCase() {
  const wishlists = new InMemoryWishlistRepository();
  const items = new InMemoryItemRepository();
  const holds = new InMemoryHoldRepository();
  const eventStore = new InMemoryEventStore();
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, items, holds, eventStore });
  const tokenGenerator = new SequentialTokenGenerator();
  const useCase = new CreateList(unitOfWork, tokenGenerator);
  return { useCase, wishlists, items };
}

describe('CreateList', () => {
  it('creates a wishlist and one single-type item, returning slug/ownerToken/key/itemId', async () => {
    const { useCase, wishlists, items } = makeUseCase();

    const result = await useCase.execute({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    expect(result).toEqual({
      slug: 'slug-2', ownerToken: 'owner-token-3', key: 'guest-key-4', itemId: 'id-5',
    });
    const persistedWishlist = await wishlists.findBySlug('slug-2');
    expect(persistedWishlist?.title).toBe('Baby Shower');
    const persistedItem = await items.findById('id-5');
    expect(persistedItem?.title).toBe('Stroller');
    expect(persistedItem?.wishlistId).toBe(persistedWishlist?.id);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/application/use-cases/CreateList.test.ts
```

Expected: FAIL — `./CreateList` doesn't exist yet.

- [ ] **Step 3: Implement `CreateList.ts`**

```ts
import { Wishlist } from '../../domain/entities/Wishlist';
import { Item } from '../../domain/entities/Item';
import type { UnitOfWork } from '../ports/UnitOfWork';
import type { TokenGenerator } from '../ports/TokenGenerator';

export interface CreateListInput {
  listTitle: string;
  itemTitle: string;
}

export interface CreateListOutput {
  slug: string;
  ownerToken: string;
  key: string;
  itemId: string;
}

export class CreateList {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
  ) {}

  async execute(input: CreateListInput): Promise<CreateListOutput> {
    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = Wishlist.create({
        id: this.tokenGenerator.generateId(),
        slug: this.tokenGenerator.generateSlug(),
        title: input.listTitle,
        ownerToken: this.tokenGenerator.generateOwnerToken(),
        key: this.tokenGenerator.generateGuestKey(),
      });
      await ctx.wishlists.insert(wishlist);

      const item = Item.createSingle({
        id: this.tokenGenerator.generateId(),
        wishlistId: wishlist.id,
        title: input.itemTitle,
      });
      await ctx.items.insert(item);

      return { slug: wishlist.slug, ownerToken: wishlist.ownerToken, key: wishlist.key, itemId: item.id };
    });
  }
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/application/use-cases/CreateList.test.ts
```

Expected: PASS. (The exact `id-N`/`slug-N` values in the test assert
the call order inside `execute` — id, slug, then owner-token, then
guest-key, then the item's id. If you reorder the calls inside
`execute`, update the test's expected literals to match, don't fight
the fake to preserve them.)

- [ ] **Step 5: Lint**

```bash
cd apps/api && npx eslint src/application
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/application/use-cases/CreateList.ts apps/api/src/application/use-cases/CreateList.test.ts
git commit -m "feat(api): add CreateList use case

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 7: `EnterGuestKey` use case

**Branch:** same as Task 6 — `feat/walking-skeleton/05-create-and-key`.

Read-only — no `UnitOfWork` involved, since nothing is written. This
use case is injected with a plain `WishlistRepository` instance bound
to the main DB connection (wired in Task 11), not a transaction-scoped
one.

**Files:**
- Create: `apps/api/src/application/use-cases/EnterGuestKey.ts`
- Create: `apps/api/src/application/test-fakes/PlainSecretComparer.ts`
- Test: `apps/api/src/application/use-cases/EnterGuestKey.test.ts`

**Interfaces:**
- Consumes: `WishlistRepository`, `SecretComparer`, `TokenGenerator` (Task 5).
- Produces: `EnterGuestKey` class with `execute({ slug, key }): Promise<{ wishlistId: string; keyGen: number; sessionId: string }>` — consumed by Task 11's presentation route, which sets the session cookie from this output.

- [ ] **Step 1: Add a plain (non-constant-time) fake `SecretComparer` for use-case tests**

Constant-time correctness is Task 10's concern (the real
`SecretComparerCrypto` adapter, tested against actual timing-unrelated
behavior); use-case tests only need correct equality semantics.

Create `apps/api/src/application/test-fakes/PlainSecretComparer.ts`:

```ts
import type { SecretComparer } from '../ports/SecretComparer';

export class PlainSecretComparer implements SecretComparer {
  constantTimeEqual(a: string, b: string): boolean {
    return a === b;
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/application/use-cases/EnterGuestKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EnterGuestKey } from './EnterGuestKey';
import { Wishlist } from '../../domain/entities/Wishlist';
import { InMemoryWishlistRepository } from '../test-fakes/InMemoryRepositories';
import { PlainSecretComparer } from '../test-fakes/PlainSecretComparer';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../../domain/errors';

async function seedWishlist(wishlists: InMemoryWishlistRepository) {
  const wishlist = Wishlist.create({
    id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'correct-key',
  });
  await wishlists.insert(wishlist);
  return wishlist;
}

describe('EnterGuestKey', () => {
  it('returns wishlistId/keyGen/sessionId for a correct key', async () => {
    const wishlists = new InMemoryWishlistRepository();
    await seedWishlist(wishlists);
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator());

    const result = await useCase.execute({ slug: 'abc123', key: 'correct-key' });

    expect(result).toEqual({ wishlistId: 'w1', keyGen: 1, sessionId: 'session-1' });
  });

  it('throws InvalidGuestKeyError for a wrong key', async () => {
    const wishlists = new InMemoryWishlistRepository();
    await seedWishlist(wishlists);
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator());

    await expect(useCase.execute({ slug: 'abc123', key: 'wrong-key' })).rejects.toThrow(InvalidGuestKeyError);
  });

  it('throws WishlistNotFoundError for an unknown slug', async () => {
    const wishlists = new InMemoryWishlistRepository();
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator());

    await expect(useCase.execute({ slug: 'no-such-slug', key: 'anything' })).rejects.toThrow(WishlistNotFoundError);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/application/use-cases/EnterGuestKey.test.ts
```

Expected: FAIL — `./EnterGuestKey` doesn't exist yet.

- [ ] **Step 4: Implement `EnterGuestKey.ts`**

```ts
import type { WishlistRepository } from '../ports/WishlistRepository';
import type { SecretComparer } from '../ports/SecretComparer';
import type { TokenGenerator } from '../ports/TokenGenerator';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../../domain/errors';

export interface EnterGuestKeyInput {
  slug: string;
  key: string;
}

export interface EnterGuestKeyOutput {
  wishlistId: string;
  keyGen: number;
  sessionId: string;
}

export class EnterGuestKey {
  constructor(
    private wishlists: WishlistRepository,
    private secretComparer: SecretComparer,
    private tokenGenerator: TokenGenerator,
  ) {}

  async execute(input: EnterGuestKeyInput): Promise<EnterGuestKeyOutput> {
    const wishlist = await this.wishlists.findBySlug(input.slug);
    if (!wishlist) throw new WishlistNotFoundError();
    if (!this.secretComparer.constantTimeEqual(wishlist.key, input.key)) {
      throw new InvalidGuestKeyError();
    }
    return { wishlistId: wishlist.id, keyGen: wishlist.keyGen, sessionId: this.tokenGenerator.generateSessionId() };
  }
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/application/use-cases/EnterGuestKey.test.ts
```

Expected: PASS.

Note the presentation-layer route (Task 11) must return the **same
generic not-found response** whether the slug doesn't exist or the key
is wrong — `WishlistNotFoundError` vs. `InvalidGuestKeyError` are
distinguished here for testability, but per
[access & identity](../spec/access-identity.md), ADR-[016](../adr/0016-no-public-list-directory-lookups-fail-generically.md),
the HTTP layer must not let a guest distinguish "no such list" from
"wrong key" by response shape or status code.

- [ ] **Step 6: Lint**

```bash
cd apps/api && npx eslint src/application
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/application/use-cases/EnterGuestKey.ts \
        apps/api/src/application/use-cases/EnterGuestKey.test.ts \
        apps/api/src/application/test-fakes/PlainSecretComparer.ts
git commit -m "feat(api): add EnterGuestKey use case

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 8: `HoldItem` use case

The core of the walking skeleton: appends `ItemHeld` to the item's
event stream and updates the `holds`/item-state projections
**synchronously, in the same transaction** (ADR-009) — this is the one
place the whole event-sourcing seam actually gets exercised.

**Branch:** `feat/walking-skeleton/06-hold-item`, off `feat/walking-skeleton/05-create-and-key`.

**Files:**
- Create: `apps/api/src/application/use-cases/HoldItem.ts`
- Create: `apps/api/src/application/test-fakes/FakeHasher.ts`
- Test: `apps/api/src/application/use-cases/HoldItem.test.ts`

**Interfaces:**
- Consumes: `UnitOfWork`/`TransactionContext` (Task 5), `TokenGenerator`, `Clock`, `Hasher` (Task 5), `anItem` builder (Task 5), `Hold.create` (Task 4), `ItemHeldEvent` (Task 4).
- Produces: `HoldItem` class with `execute({ itemId, sessionId, idempotencyKey }): Promise<{ holdId: string; itemId: string; expiresAt: string }>` — consumed by Task 11's presentation route.

- [ ] **Step 1: Add a fake `Hasher` for use-case tests**

Create `apps/api/src/application/test-fakes/FakeHasher.ts`:

```ts
import type { Hasher } from '../ports/Hasher';

/** Deterministic, non-cryptographic — good enough for asserting "the same input hashes the same way" in use-case tests. Task 10's SecretComparerCrypto/HasherSha256 cover real hashing. */
export class FakeHasher implements Hasher {
  hash(value: string): string {
    return `hashed:${value}`;
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/application/use-cases/HoldItem.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HoldItem } from './HoldItem';
import { anItem } from '../test-fakes/builders';
import {
  InMemoryWishlistRepository, InMemoryItemRepository, InMemoryHoldRepository,
  InMemoryEventStore, InMemoryUnitOfWork,
} from '../test-fakes/InMemoryRepositories';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator';
import { FixedClock } from '../test-fakes/FixedClock';
import { FakeHasher } from '../test-fakes/FakeHasher';
import { ItemNotFoundError, ItemAlreadyHeldError } from '../../domain/errors';

function makeUseCase() {
  const wishlists = new InMemoryWishlistRepository();
  const items = new InMemoryItemRepository();
  const holds = new InMemoryHoldRepository();
  const eventStore = new InMemoryEventStore();
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, items, holds, eventStore });
  const tokenGenerator = new SequentialTokenGenerator();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  const hasher = new FakeHasher();
  const useCase = new HoldItem(unitOfWork, tokenGenerator, clock, hasher);
  return { useCase, items, holds, eventStore };
}

async function seedItem(items: InMemoryItemRepository) {
  // Builder used here (Task 5) rather than Item.createSingle({...}) directly —
  // this file is where the pattern's value shows up first.
  const item = anItem().withId('item-1').withWishlistId('w1').withTitle('Stroller').build();
  await items.insert(item);
  return item;
}

describe('HoldItem', () => {
  it('holds an available item, appends ItemHeld, and marks it held', async () => {
    const { useCase, items, holds } = makeUseCase();
    await seedItem(items);

    const result = await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    expect(result.itemId).toBe('item-1');
    expect(result.expiresAt).toBe('2026-01-04T00:00:00.000Z');
    const state = await items.getState('item-1');
    expect(state.status).toBe('held');
    expect(state.activeHolds).toBe(1);
    const recorded = await holds.findByIdempotencyKey('item-1', 'idem-1');
    expect(recorded?.sessionHash).toBe('hashed:session-abc');
  });

  it('replays the original result for a repeated idempotency key instead of creating a second hold', async () => {
    const { useCase, items } = makeUseCase();
    await seedItem(items);

    const first = await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });
    const second = await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    expect(second).toEqual(first);
    const state = await items.getState('item-1');
    expect(state.activeHolds).toBe(1); // not 2
  });

  it('throws ItemAlreadyHeldError for a second, different hold attempt on a held item', async () => {
    const { useCase, items } = makeUseCase();
    await seedItem(items);
    await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    await expect(
      useCase.execute({ itemId: 'item-1', sessionId: 'session-xyz', idempotencyKey: 'idem-2' }),
    ).rejects.toThrow(ItemAlreadyHeldError);
  });

  it('throws ItemNotFoundError for an unknown item', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ itemId: 'no-such-item', sessionId: 'session-abc', idempotencyKey: 'idem-1' }),
    ).rejects.toThrow(ItemNotFoundError);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/application/use-cases/HoldItem.test.ts
```

Expected: FAIL — `./HoldItem` doesn't exist yet.

- [ ] **Step 4: Implement `HoldItem.ts`**

```ts
import { Hold } from '../../domain/entities/Hold';
import type { ItemHeldEvent } from '../../domain/events/ItemHeldEvent';
import type { UnitOfWork } from '../ports/UnitOfWork';
import type { TokenGenerator } from '../ports/TokenGenerator';
import type { Clock } from '../ports/Clock';
import type { Hasher } from '../ports/Hasher';
import { ItemNotFoundError, ItemAlreadyHeldError } from '../../domain/errors';

const HOLD_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // ADR-002: 3-day hold

export interface HoldItemInput {
  itemId: string;
  sessionId: string;
  idempotencyKey: string;
}

export interface HoldItemOutput {
  holdId: string;
  itemId: string;
  expiresAt: string;
}

export class HoldItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
    private hasher: Hasher,
  ) {}

  async execute(input: HoldItemInput): Promise<HoldItemOutput> {
    return this.unitOfWork.execute(async (ctx) => {
      const item = await ctx.items.findById(input.itemId);
      if (!item) throw new ItemNotFoundError(input.itemId);

      const existing = await ctx.holds.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) {
        return { holdId: existing.id, itemId: existing.itemId, expiresAt: existing.expiresAt.toISOString() };
      }

      const state = await ctx.items.getState(input.itemId);
      if (state.activeHolds >= item.quantity) {
        throw new ItemAlreadyHeldError(input.itemId);
      }

      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);
      const hold = Hold.create({
        id: this.tokenGenerator.generateId(),
        itemId: input.itemId,
        secret: this.tokenGenerator.generateHoldSecret(),
        sessionHash: this.hasher.hash(input.sessionId),
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        now,
      });

      const event: ItemHeldEvent = {
        type: 'ItemHeld',
        itemId: hold.itemId,
        holdId: hold.id,
        secret: hold.secret,
        sessionHash: hold.sessionHash,
        idempotencyKey: hold.idempotencyKey,
        expiresAt: hold.expiresAt.toISOString(),
        occurredAt: now.toISOString(),
      };
      await ctx.eventStore.append(input.itemId, state.seq, [event]);

      await ctx.holds.recordHold({
        id: hold.id, itemId: hold.itemId, secret: hold.secret,
        sessionHash: hold.sessionHash, idempotencyKey: hold.idempotencyKey, expiresAt: hold.expiresAt,
      });
      await ctx.items.markHeld(input.itemId, state.seq + 1);

      return { holdId: hold.id, itemId: hold.itemId, expiresAt: hold.expiresAt.toISOString() };
    });
  }
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/application/use-cases/HoldItem.test.ts
```

Expected: PASS, all four cases.

- [ ] **Step 6: Lint**

```bash
cd apps/api && npx eslint src/application
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/application/use-cases/HoldItem.ts \
        apps/api/src/application/use-cases/HoldItem.test.ts \
        apps/api/src/application/test-fakes/FakeHasher.ts
git commit -m "feat(api): add HoldItem use case

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 9: Infrastructure — SQLite schema, migration, and Kysely-backed adapters

Every class here is an Adapter (GoF): it wraps Kysely/`better-sqlite3`
behind the port interfaces from Task 5. Tested against a real
in-memory SQLite database (`:memory:`), never mocked, per `testing.md`.

The cross-item concurrent-hold cap's `BEGIN IMMEDIATE` requirement
(`backend-architecture.md`'s load-bearing guardrail) does **not** apply
here — this skeleton has no cross-item invariant (that's ADR-046,
sub-project 2). Ordinary transaction isolation is sufficient for a
single item's own single-hold happy path.

**Branch:** `feat/walking-skeleton/07-persistence`, off `feat/walking-skeleton/06-hold-item`.

**Files:**
- Create: `apps/api/src/infrastructure/db/schema.ts`
- Create: `apps/api/src/infrastructure/db/createDb.ts`
- Create: `apps/api/src/infrastructure/db/migrations/0001_init.ts`
- Create: `apps/api/src/infrastructure/db/migrate.ts`
- Create: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Create: `apps/api/src/infrastructure/ItemRepositoryKysely.ts`
- Create: `apps/api/src/infrastructure/HoldRepositoryKysely.ts`
- Create: `apps/api/src/infrastructure/EventStoreKysely.ts`
- Create: `apps/api/src/infrastructure/UnitOfWorkKysely.ts`
- Test: `apps/api/src/infrastructure/persistence.integration.test.ts`

**Interfaces:**
- Consumes: every port from Task 5, `Wishlist`/`Item` domain entities (Task 4).
- Produces: the five adapter classes above, all implementing their Task-5 port interfaces — consumed by Task 11's composition root.

- [ ] **Step 1: Define the Kysely `Database` schema**

Create `apps/api/src/infrastructure/db/schema.ts`:

```ts
import type { Generated } from 'kysely';

export interface WishlistsTable {
  id: string;
  slug: string;
  title: string;
  owner_token: string;
  key: string;
  key_gen: number;
  created_at: string;
}

export interface ItemsTable {
  id: string;
  wishlist_id: string;
  type: string;
  title: string;
  quantity: number;
  created_at: string;
}

export interface ItemStateTable {
  item_id: string;
  seq: number;
  active_holds: number;
  status: string;
  updated_at: string;
}

export interface HoldsTable {
  id: string;
  item_id: string;
  secret: string;
  session_hash: string;
  idempotency_key: string;
  expires_at: string;
  created_at: string;
}

export interface EventLogTable {
  id: Generated<number>;
  item_id: string;
  seq: number;
  event_type: string;
  payload: string;
  recorded_at: string;
}

export interface Database {
  wishlists: WishlistsTable;
  items: ItemsTable;
  item_state: ItemStateTable;
  holds: HoldsTable;
  event_log: EventLogTable;
}
```

- [ ] **Step 2: Write the migration and the DB factory**

Create `apps/api/src/infrastructure/db/migrations/0001_init.ts`:

```ts
import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  const schema = db.schema as Kysely<any>['schema'];

  await schema.createTable('wishlists').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('owner_token', 'text', (col) => col.notNull())
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('key_gen', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('items').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('wishlist_id', 'text', (col) => col.notNull().references('wishlists.id'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('item_state').ifNotExists()
    .addColumn('item_id', 'text', (col) => col.primaryKey().references('items.id'))
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('active_holds', 'integer', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('holds').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('item_id', 'text', (col) => col.notNull().references('items.id'))
    .addColumn('secret', 'text', (col) => col.notNull())
    .addColumn('session_hash', 'text', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('holds_item_idempotency_key_unique', ['item_id', 'idempotency_key'])
    .execute();

  await schema.createTable('event_log').ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('item_id', 'text', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('event_type', 'text', (col) => col.notNull())
    .addColumn('payload', 'text', (col) => col.notNull())
    .addColumn('recorded_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('event_log_item_seq_unique', ['item_id', 'seq'])
    .execute();
}
```

Create `apps/api/src/infrastructure/db/createDb.ts`:

```ts
import SqliteDatabase from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema';

export function createDb(path: string): Kysely<Database> {
  const sqlite = new SqliteDatabase(path);
  sqlite.pragma('journal_mode = WAL');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}
```

Create `apps/api/src/infrastructure/db/migrate.ts`:

```ts
import { createDb } from './createDb';
import { up } from './migrations/0001_init';
import type { Database } from './schema';
import type { Kysely } from 'kysely';

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await up(db as unknown as Kysely<unknown>);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const path = process.env.DATABASE_PATH ?? './data/wishlist.db';
  const db = createDb(path);
  migrateToLatest(db)
    .then(async () => { console.log('Migration complete.'); await db.destroy(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 3: Write the failing integration test**

Create `apps/api/src/infrastructure/persistence.integration.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from './db/createDb';
import { migrateToLatest } from './db/migrate';
import type { Database } from './db/schema';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely';
import { ItemRepositoryKysely } from './ItemRepositoryKysely';
import { HoldRepositoryKysely } from './HoldRepositoryKysely';
import { EventStoreKysely } from './EventStoreKysely';
import { UnitOfWorkKysely } from './UnitOfWorkKysely';
import { Wishlist } from '../domain/entities/Wishlist';
import { Item } from '../domain/entities/Item';
import { ConcurrencyError } from '../domain/errors';

let db: Kysely<Database>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
});

describe('WishlistRepositoryKysely', () => {
  it('round-trips a wishlist through insert and findBySlug', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });

    await repo.insert(wishlist);
    const found = await repo.findBySlug('abc123');

    expect(found).toEqual(wishlist);
  });

  it('returns null for an unknown slug', async () => {
    const repo = new WishlistRepositoryKysely(db);
    expect(await repo.findBySlug('no-such-slug')).toBeNull();
  });
});

describe('ItemRepositoryKysely', () => {
  it('inserting an item also creates an available item_state row', async () => {
    const repo = new ItemRepositoryKysely(db);
    const item = Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' });

    await repo.insert(item);

    expect(await repo.findById('i1')).toEqual(item);
    expect(await repo.getState('i1')).toEqual({ seq: 0, activeHolds: 0, status: 'available' });
  });

  it('markHeld increments activeHolds and sets status/seq', async () => {
    const repo = new ItemRepositoryKysely(db);
    await repo.insert(Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' }));

    await repo.markHeld('i1', 1);

    expect(await repo.getState('i1')).toEqual({ seq: 1, activeHolds: 1, status: 'held' });
  });

  it('findByWishlistId finds the item belonging to a wishlist', async () => {
    const repo = new ItemRepositoryKysely(db);
    await repo.insert(Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' }));

    const found = await repo.findByWishlistId('w1');

    expect(found?.id).toBe('i1');
  });
});

describe('HoldRepositoryKysely', () => {
  it('round-trips a hold through recordHold and findByIdempotencyKey', async () => {
    await new ItemRepositoryKysely(db).insert(Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' }));
    const repo = new HoldRepositoryKysely(db);
    const expiresAt = new Date('2026-01-04T00:00:00.000Z');

    await repo.recordHold({ id: 'h1', itemId: 'i1', secret: 'secret', sessionHash: 'hash', idempotencyKey: 'idem-1', expiresAt });
    const found = await repo.findByIdempotencyKey('i1', 'idem-1');

    expect(found).toEqual({ id: 'h1', itemId: 'i1', secret: 'secret', sessionHash: 'hash', idempotencyKey: 'idem-1', expiresAt });
  });

  it('returns null for an unknown idempotency key', async () => {
    const repo = new HoldRepositoryKysely(db);
    expect(await repo.findByIdempotencyKey('i1', 'no-such-key')).toBeNull();
  });
});

describe('EventStoreKysely', () => {
  it('appends events when expectedSeq matches the stream length', async () => {
    const store = new EventStoreKysely(db);
    await store.append('i1', 0, [{ type: 'ItemHeld', occurredAt: '2026-01-01T00:00:00.000Z' }]);

    const rows = await db.selectFrom('event_log').selectAll().where('item_id', '=', 'i1').execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(1);
  });

  it('throws ConcurrencyError when expectedSeq is stale', async () => {
    const store = new EventStoreKysely(db);
    await store.append('i1', 0, [{ type: 'ItemHeld', occurredAt: '2026-01-01T00:00:00.000Z' }]);

    await expect(
      store.append('i1', 0, [{ type: 'ItemHeld', occurredAt: '2026-01-01T00:00:01.000Z' }]),
    ).rejects.toThrow(ConcurrencyError);
  });
});

describe('UnitOfWorkKysely', () => {
  it('commits all writes made inside a successful execute() call', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await unitOfWork.execute(async (ctx) => {
      await ctx.wishlists.insert(Wishlist.create({ id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
    });

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123')).not.toBeNull();
  });

  it('rolls back all writes when the callback throws', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await expect(
      unitOfWork.execute(async (ctx) => {
        await ctx.wishlists.insert(Wishlist.create({ id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123')).toBeNull();
  });
});
```

- [ ] **Step 4: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/infrastructure/persistence.integration.test.ts
```

Expected: FAIL — none of the five adapter classes exist yet.

- [ ] **Step 5: Implement the adapters**

Create `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from './db/schema';
import type { WishlistRepository } from '../application/ports/WishlistRepository';
import { Wishlist } from '../domain/entities/Wishlist';

export class WishlistRepositoryKysely implements WishlistRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(wishlist: Wishlist): Promise<void> {
    await this.db.insertInto('wishlists').values({
      id: wishlist.id, slug: wishlist.slug, title: wishlist.title,
      owner_token: wishlist.ownerToken, key: wishlist.key, key_gen: wishlist.keyGen,
      created_at: new Date().toISOString(),
    }).execute();
  }

  async findBySlug(slug: string): Promise<Wishlist | null> {
    const row = await this.db.selectFrom('wishlists').selectAll().where('slug', '=', slug).executeTakeFirst();
    if (!row) return null;
    return Wishlist.reconstitute({
      id: row.id, slug: row.slug, title: row.title, ownerToken: row.owner_token, key: row.key, keyGen: row.key_gen,
    });
  }
}
```

Create `apps/api/src/infrastructure/ItemRepositoryKysely.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from './db/schema';
import type { ItemRepository, ItemState } from '../application/ports/ItemRepository';
import { Item } from '../domain/entities/Item';

export class ItemRepositoryKysely implements ItemRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(item: Item): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto('items').values({
      id: item.id, wishlist_id: item.wishlistId, type: item.type, title: item.title,
      quantity: item.quantity, created_at: now,
    }).execute();
    await this.db.insertInto('item_state').values({
      item_id: item.id, seq: 0, active_holds: 0, status: 'available', updated_at: now,
    }).execute();
  }

  async findById(id: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({ id: row.id, wishlistId: row.wishlist_id, title: row.title });
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items').selectAll().where('wishlist_id', '=', wishlistId).executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({ id: row.id, wishlistId: row.wishlist_id, title: row.title });
  }

  async getState(itemId: string): Promise<ItemState> {
    const row = await this.db.selectFrom('item_state').selectAll().where('item_id', '=', itemId).executeTakeFirst();
    if (!row) throw new Error(`No state for item ${itemId}`);
    return { seq: row.seq, activeHolds: row.active_holds, status: row.status as 'available' | 'held' };
  }

  async markHeld(itemId: string, newSeq: number): Promise<void> {
    const current = await this.getState(itemId);
    await this.db.updateTable('item_state')
      .set({ seq: newSeq, active_holds: current.activeHolds + 1, status: 'held', updated_at: new Date().toISOString() })
      .where('item_id', '=', itemId)
      .execute();
  }
}
```

Create `apps/api/src/infrastructure/HoldRepositoryKysely.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from './db/schema';
import type { HoldRepository, HoldRecord } from '../application/ports/HoldRepository';

export class HoldRepositoryKysely implements HoldRepository {
  constructor(private db: Kysely<Database>) {}

  async recordHold(hold: HoldRecord): Promise<void> {
    await this.db.insertInto('holds').values({
      id: hold.id, item_id: hold.itemId, secret: hold.secret, session_hash: hold.sessionHash,
      idempotency_key: hold.idempotencyKey, expires_at: hold.expiresAt.toISOString(), created_at: new Date().toISOString(),
    }).execute();
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<HoldRecord | null> {
    const row = await this.db.selectFrom('holds').selectAll()
      .where('item_id', '=', itemId).where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id, itemId: row.item_id, secret: row.secret, sessionHash: row.session_hash,
      idempotencyKey: row.idempotency_key, expiresAt: new Date(row.expires_at),
    };
  }
}
```

Create `apps/api/src/infrastructure/EventStoreKysely.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from './db/schema';
import type { EventStore, DomainEvent } from '../application/ports/EventStore';
import { ConcurrencyError } from '../domain/errors';

export class EventStoreKysely implements EventStore {
  constructor(private db: Kysely<Database>) {}

  async append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void> {
    const countRow = await this.db.selectFrom('event_log')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('item_id', '=', itemId)
      .executeTakeFirstOrThrow();
    const currentSeq = Number(countRow.count);
    if (currentSeq !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, currentSeq);
    }

    let seq = expectedSeq;
    for (const event of events) {
      seq += 1;
      await this.db.insertInto('event_log').values({
        item_id: itemId, seq, event_type: event.type,
        payload: JSON.stringify(event), recorded_at: event.occurredAt,
      }).execute();
    }
  }
}
```

Create `apps/api/src/infrastructure/UnitOfWorkKysely.ts`. It takes an
optional `wrapEventStore` hook so Task 10's `LoggingEventStore`
decorator can be attached later without this file needing to know
about a class that doesn't exist yet:

```ts
import type { Kysely } from 'kysely';
import type { Database } from './db/schema';
import type { UnitOfWork, TransactionContext } from '../application/ports/UnitOfWork';
import type { EventStore } from '../application/ports/EventStore';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely';
import { ItemRepositoryKysely } from './ItemRepositoryKysely';
import { HoldRepositoryKysely } from './HoldRepositoryKysely';
import { EventStoreKysely } from './EventStoreKysely';

export class UnitOfWorkKysely implements UnitOfWork {
  constructor(
    private db: Kysely<Database>,
    private wrapEventStore: (base: EventStore) => EventStore = (base) => base,
  ) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return this.db.transaction().execute((trx) => fn({
      wishlists: new WishlistRepositoryKysely(trx),
      items: new ItemRepositoryKysely(trx),
      holds: new HoldRepositoryKysely(trx),
      eventStore: this.wrapEventStore(new EventStoreKysely(trx)),
    }));
  }
}
```

The integration test's two `UnitOfWorkKysely` cases above construct it
with `new UnitOfWorkKysely(db)` — the default identity wrapper — so
they're unaffected by this hook.

- [ ] **Step 6: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/infrastructure/persistence.integration.test.ts
```

Expected: PASS, all cases across all five `describe` blocks.

- [ ] **Step 7: Lint**

```bash
cd apps/api && npx eslint src/infrastructure
```

Expected: no errors. (The layer-boundary rule from Task 2 doesn't apply
here — it only restricts `domain/`/`application/`.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/infrastructure
git commit -m "feat(api): add SQLite schema, migration, and Kysely-backed persistence adapters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 10: Infrastructure — crypto adapters and the observability Decorator seam

Four more Adapters (`Clock`, `TokenGenerator`, `SecretComparer`,
`Hasher`), plus the Decorator pattern applied to `EventStore`: the
`LoggingEventStore` wraps the real one with logging, without either
side knowing about the other. Only the seam is built here — real
pino/OpenTelemetry wiring (ADR-030) is sub-project 6; `ConsoleLogger`
is a placeholder `Logger` implementation good enough for local dev.

**Branch:** `feat/walking-skeleton/08-crypto-and-observability`, off `feat/walking-skeleton/07-persistence`.

**Files:**
- Create: `apps/api/src/infrastructure/ClockSystem.ts`
- Create: `apps/api/src/infrastructure/TokenGeneratorCrypto.ts`
- Create: `apps/api/src/infrastructure/SecretComparerCrypto.ts`
- Create: `apps/api/src/infrastructure/HasherSha256.ts`
- Create: `apps/api/src/infrastructure/ConsoleLogger.ts`
- Create: `apps/api/src/infrastructure/LoggingEventStore.ts`
- Test: `apps/api/src/infrastructure/crypto-adapters.test.ts`
- Test: `apps/api/src/infrastructure/LoggingEventStore.test.ts`

**Interfaces:**
- Consumes: `Clock`, `TokenGenerator`, `SecretComparer`, `Hasher`, `Logger`, `EventStore` ports (Task 5).
- Produces: `ClockSystem`, `TokenGeneratorCrypto`, `SecretComparerCrypto`, `HasherSha256`, `ConsoleLogger`, `LoggingEventStore` — consumed by Task 11's composition root.

- [ ] **Step 1: Write the failing tests for the crypto adapters**

Create `apps/api/src/infrastructure/crypto-adapters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ClockSystem } from './ClockSystem';
import { TokenGeneratorCrypto } from './TokenGeneratorCrypto';
import { SecretComparerCrypto } from './SecretComparerCrypto';
import { HasherSha256 } from './HasherSha256';

describe('ClockSystem', () => {
  it('returns a Date close to the actual current time', () => {
    const before = Date.now();
    const now = new ClockSystem().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('TokenGeneratorCrypto', () => {
  const gen = new TokenGeneratorCrypto();

  it('produces non-empty, distinct values across calls', () => {
    const a = gen.generateHoldSecret();
    const b = gen.generateHoldSecret();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('generateId produces a valid UUID', () => {
    const id = gen.generateId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('SecretComparerCrypto', () => {
  const comparer = new SecretComparerCrypto();

  it('returns true for equal strings', () => {
    expect(comparer.constantTimeEqual('secret', 'secret')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(comparer.constantTimeEqual('secret', 'secrat')).toBe(false);
  });

  it('returns false (not throws) for strings of different lengths', () => {
    expect(comparer.constantTimeEqual('short', 'a much longer string')).toBe(false);
  });
});

describe('HasherSha256', () => {
  const hasher = new HasherSha256();

  it('produces the same hash for the same input', () => {
    expect(hasher.hash('session-abc')).toBe(hasher.hash('session-abc'));
  });

  it('produces different hashes for different input', () => {
    expect(hasher.hash('session-abc')).not.toBe(hasher.hash('session-xyz'));
  });

  it('produces a 64-character hex string', () => {
    expect(hasher.hash('session-abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/infrastructure/crypto-adapters.test.ts
```

Expected: FAIL — none of the four adapter classes exist yet.

- [ ] **Step 3: Implement the crypto adapters**

Create `apps/api/src/infrastructure/ClockSystem.ts`:

```ts
import type { Clock } from '../application/ports/Clock';

export class ClockSystem implements Clock {
  now(): Date {
    return new Date();
  }
}
```

Create `apps/api/src/infrastructure/TokenGeneratorCrypto.ts`:

```ts
import { randomBytes, randomUUID } from 'node:crypto';
import type { TokenGenerator } from '../application/ports/TokenGenerator';

export class TokenGeneratorCrypto implements TokenGenerator {
  generateId(): string { return randomUUID(); }
  generateSlug(): string { return randomBytes(6).toString('base64url'); }
  generateOwnerToken(): string { return randomBytes(24).toString('base64url'); }
  generateGuestKey(): string { return randomBytes(24).toString('base64url'); }
  generateHoldSecret(): string { return randomBytes(24).toString('base64url'); }
  generateSessionId(): string { return randomUUID(); }
}
```

Create `apps/api/src/infrastructure/SecretComparerCrypto.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';
import type { SecretComparer } from '../application/ports/SecretComparer';

export class SecretComparerCrypto implements SecretComparer {
  constantTimeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Compare bufA against itself so a length mismatch doesn't return
      // instantly relative to the equal-length path (ADR-035).
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
```

Create `apps/api/src/infrastructure/HasherSha256.ts`:

```ts
import { createHash } from 'node:crypto';
import type { Hasher } from '../application/ports/Hasher';

export class HasherSha256 implements Hasher {
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/infrastructure/crypto-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing test for the `LoggingEventStore` decorator**

Create `apps/api/src/infrastructure/LoggingEventStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LoggingEventStore } from './LoggingEventStore';
import type { EventStore, DomainEvent } from '../application/ports/EventStore';
import type { Logger } from '../application/ports/Logger';

describe('LoggingEventStore', () => {
  it('delegates to the inner EventStore and logs after a successful append', async () => {
    const appended: [string, number, DomainEvent[]][] = [];
    const inner: EventStore = {
      append: async (itemId, expectedSeq, events) => { appended.push([itemId, expectedSeq, events]); },
    };
    const logs: [string, Record<string, unknown> | undefined][] = [];
    const logger: Logger = { info: (message, meta) => { logs.push([message, meta]); } };
    const decorated = new LoggingEventStore(inner, logger);
    const event: DomainEvent = { type: 'ItemHeld', occurredAt: '2026-01-01T00:00:00.000Z' };

    await decorated.append('i1', 0, [event]);

    expect(appended).toEqual([['i1', 0, [event]]]);
    expect(logs).toEqual([['event_store.append', { itemId: 'i1', expectedSeq: 0, eventTypes: ['ItemHeld'] }]]);
  });

  it('propagates an error from the inner store without logging', async () => {
    const inner: EventStore = { append: async () => { throw new Error('boom'); } };
    const logs: unknown[] = [];
    const logger: Logger = { info: (...args) => { logs.push(args); } };
    const decorated = new LoggingEventStore(inner, logger);

    await expect(decorated.append('i1', 0, [])).rejects.toThrow('boom');
    expect(logs).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/infrastructure/LoggingEventStore.test.ts
```

Expected: FAIL — `./LoggingEventStore` doesn't exist yet.

- [ ] **Step 7: Implement `LoggingEventStore.ts` and `ConsoleLogger.ts`**

Create `apps/api/src/infrastructure/ConsoleLogger.ts`:

```ts
import type { Logger } from '../application/ports/Logger';

/** Placeholder Logger — real pino/OpenTelemetry wiring (ADR-030) is sub-project 6. */
export class ConsoleLogger implements Logger {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', message, ...meta }));
  }
}
```

Create `apps/api/src/infrastructure/LoggingEventStore.ts`:

```ts
import type { EventStore, DomainEvent } from '../application/ports/EventStore';
import type { Logger } from '../application/ports/Logger';

export class LoggingEventStore implements EventStore {
  constructor(
    private inner: EventStore,
    private logger: Logger,
  ) {}

  async append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void> {
    await this.inner.append(itemId, expectedSeq, events);
    this.logger.info('event_store.append', { itemId, expectedSeq, eventTypes: events.map((e) => e.type) });
  }
}
```

- [ ] **Step 8: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/infrastructure/LoggingEventStore.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 9: Lint and full infrastructure test run**

```bash
cd apps/api && npx eslint src/infrastructure && npx vitest run src/infrastructure
```

Expected: no lint errors; every test in `src/infrastructure` passes.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/infrastructure/ClockSystem.ts apps/api/src/infrastructure/TokenGeneratorCrypto.ts \
        apps/api/src/infrastructure/SecretComparerCrypto.ts apps/api/src/infrastructure/HasherSha256.ts \
        apps/api/src/infrastructure/ConsoleLogger.ts apps/api/src/infrastructure/LoggingEventStore.ts \
        apps/api/src/infrastructure/crypto-adapters.test.ts apps/api/src/infrastructure/LoggingEventStore.test.ts
git commit -m "feat(api): add crypto adapters and the LoggingEventStore observability decorator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 11: Presentation layer — Fastify app, DI composition root, routes

Wires every earlier layer together behind HTTP. After this task, the
backend is runnable and testable end-to-end via `curl`/Fastify's
`.inject()`, even though the front-end doesn't exist yet.

**Branch:** `feat/walking-skeleton/09-presentation`, off `feat/walking-skeleton/08-crypto-and-observability`.

**Files:**
- Create: `apps/api/src/presentation/compositionRoot.ts`
- Create: `apps/api/src/presentation/routes.ts`
- Create: `apps/api/src/presentation/app.ts`
- Create: `apps/api/src/presentation/server.ts`
- Modify: `.env.example` (add `SESSION_COOKIE_SECRET`)
- Test: `apps/api/src/presentation/routes.integration.test.ts`

**Interfaces:**
- Consumes: every use case (Tasks 6–8), every infrastructure adapter (Tasks 9–10), the zod schemas (Task 3).
- Produces: `buildDependencies(db)`, `buildApp(deps, options)` — consumed by Task 17's static-serving wiring and by `server.ts`'s own startup.

- [ ] **Step 1: Add the session cookie secret to `.env.example`**

Modify `.env.example`, adding after the existing `GH_TOKEN=` line:

```
# Signs the guest session cookie (HMAC via @fastify/cookie). Generate a
# real value with `openssl rand -base64 32` and set it in your gitignored
# .env — the server falls back to an insecure development default (with
# a startup warning) if this is unset, but never do that outside local dev.
SESSION_COOKIE_SECRET=
```

- [ ] **Step 2: Write the composition root**

Create `apps/api/src/presentation/compositionRoot.ts`:

```ts
import type { Kysely } from 'kysely';
import type { Database } from '../infrastructure/db/schema';
import { UnitOfWorkKysely } from '../infrastructure/UnitOfWorkKysely';
import { WishlistRepositoryKysely } from '../infrastructure/WishlistRepositoryKysely';
import { ItemRepositoryKysely } from '../infrastructure/ItemRepositoryKysely';
import { ClockSystem } from '../infrastructure/ClockSystem';
import { TokenGeneratorCrypto } from '../infrastructure/TokenGeneratorCrypto';
import { SecretComparerCrypto } from '../infrastructure/SecretComparerCrypto';
import { HasherSha256 } from '../infrastructure/HasherSha256';
import { ConsoleLogger } from '../infrastructure/ConsoleLogger';
import { LoggingEventStore } from '../infrastructure/LoggingEventStore';
import { CreateList } from '../application/use-cases/CreateList';
import { EnterGuestKey } from '../application/use-cases/EnterGuestKey';
import { HoldItem } from '../application/use-cases/HoldItem';

export interface AppDependencies {
  createList: CreateList;
  enterGuestKey: EnterGuestKey;
  holdItem: HoldItem;
  wishlists: WishlistRepositoryKysely;
  items: ItemRepositoryKysely;
}

export function buildDependencies(db: Kysely<Database>): AppDependencies {
  const logger = new ConsoleLogger();
  const unitOfWork = new UnitOfWorkKysely(db, (base) => new LoggingEventStore(base, logger));
  const tokenGenerator = new TokenGeneratorCrypto();
  const clock = new ClockSystem();
  const hasher = new HasherSha256();
  const secretComparer = new SecretComparerCrypto();
  const wishlists = new WishlistRepositoryKysely(db);
  const items = new ItemRepositoryKysely(db);

  return {
    createList: new CreateList(unitOfWork, tokenGenerator),
    enterGuestKey: new EnterGuestKey(wishlists, secretComparer, tokenGenerator),
    holdItem: new HoldItem(unitOfWork, tokenGenerator, clock, hasher),
    wishlists,
    items,
  };
}
```

- [ ] **Step 3: Write the routes**

Create `apps/api/src/presentation/routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createListRequestSchema, createListResponseSchema,
  enterGuestKeyRequestSchema, holdItemRequestSchema, listViewResponseSchema,
} from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot';
import { WishlistNotFoundError, InvalidGuestKeyError, ItemNotFoundError, ItemAlreadyHeldError } from '../domain/errors';
import type { Wishlist } from '../domain/entities/Wishlist';

const SESSION_COOKIE = 'gubbins_session';

interface SessionPayload {
  wishlistId: string;
  keyGen: number;
  sessionId: string;
}

function readSession(request: FastifyRequest, wishlist: Wishlist): SessionPayload | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const payload = JSON.parse(unsigned.value) as SessionPayload;
    if (payload.wishlistId !== wishlist.id || payload.keyGen !== wishlist.keyGen) return null;
    return payload;
  } catch {
    return null;
  }
}

export function registerRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.post('/api/lists', async (request, reply) => {
    const input = createListRequestSchema.parse(request.body);
    const result = await deps.createList.execute(input);
    reply.code(201).send(createListResponseSchema.parse(result));
  });

  app.post('/api/lists/:slug/session', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const input = enterGuestKeyRequestSchema.parse(request.body);
    try {
      const result = await deps.enterGuestKey.execute({ slug, key: input.key });
      const payload: SessionPayload = { wishlistId: result.wishlistId, keyGen: result.keyGen, sessionId: result.sessionId };
      reply.setCookie(SESSION_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict' });
      reply.code(200).send({ ok: true });
    } catch (err) {
      // Same generic response for "no such list" and "wrong key" —
      // access-identity.md / ADR-016 / ADR-054 forbid distinguishing them.
      if (err instanceof WishlistNotFoundError || err instanceof InvalidGuestKeyError) {
        reply.code(404).send({ message: 'Not found' });
        return;
      }
      throw err;
    }
  });

  app.get('/api/lists/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const wishlist = await deps.wishlists.findBySlug(slug);
    if (!wishlist) { reply.code(404).send({ message: 'Not found' }); return; }
    const session = readSession(request, wishlist);
    if (!session) { reply.code(401).send({ message: 'Not found' }); return; }

    const item = await deps.items.findByWishlistId(wishlist.id);
    if (!item) { reply.code(404).send({ message: 'Not found' }); return; }
    const state = await deps.items.getState(item.id);

    reply.send(listViewResponseSchema.parse({
      title: wishlist.title,
      item: { id: item.id, title: item.title, status: state.status },
    }));
  });

  app.post('/api/lists/:slug/items/:itemId/hold', async (request, reply) => {
    const { slug, itemId } = request.params as { slug: string; itemId: string };
    const input = holdItemRequestSchema.parse(request.body);
    const wishlist = await deps.wishlists.findBySlug(slug);
    if (!wishlist) { reply.code(404).send({ message: 'Not found' }); return; }
    const session = readSession(request, wishlist);
    if (!session) { reply.code(401).send({ message: 'Not found' }); return; }

    try {
      const result = await deps.holdItem.execute({ itemId, sessionId: session.sessionId, idempotencyKey: input.idempotencyKey });
      reply.code(201).send(result);
    } catch (err) {
      if (err instanceof ItemNotFoundError) { reply.code(404).send({ message: 'Not found' }); return; }
      if (err instanceof ItemAlreadyHeldError) { reply.code(409).send({ message: 'Item already held' }); return; }
      throw err;
    }
  });
}
```

- [ ] **Step 4: Write the Fastify app builder**

Create `apps/api/src/presentation/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { ZodError } from 'zod';
import type { AppDependencies } from './compositionRoot';
import { registerRoutes } from './routes';

export interface BuildAppOptions {
  cookieSecret: string;
  /** Directory to serve as static files (the built apps/web bundle). Omit to skip static serving — used by Task 11's own integration tests, which only exercise /api routes. */
  webDist?: string;
}

export function buildApp(deps: AppDependencies, options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie, { secret: options.cookieSecret });
  registerRoutes(app, deps);

  if (options.webDist) {
    const webDist = path.resolve(options.webDist);
    app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.method === 'GET' && !request.url.startsWith('/api/')) {
        reply.sendFile('index.html', webDist);
      } else {
        reply.code(404).send({ message: 'Not found' });
      }
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ message: 'Invalid request', issues: error.issues });
      return;
    }
    reply.code(500).send({ message: 'Internal server error' });
  });

  return app;
}
```

- [ ] **Step 5: Write the failing integration tests**

Create `apps/api/src/presentation/routes.integration.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createDb } from '../infrastructure/db/createDb';
import { migrateToLatest } from '../infrastructure/db/migrate';
import { buildDependencies } from './compositionRoot';
import { buildApp } from './app';

function extractCookieHeader(response: LightMyRequestResponse): string {
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(raw).split(';')[0];
}

let app: FastifyInstance;

beforeEach(async () => {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  app = buildApp(buildDependencies(db), { cookieSecret: 'test-secret' });
});

describe('POST /api/lists', () => {
  it('creates a list and returns slug/ownerToken/key/itemId', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toHaveProperty('slug');
    expect(body).toHaveProperty('ownerToken');
    expect(body).toHaveProperty('key');
    expect(body).toHaveProperty('itemId');
  });

  it('returns 400 for an empty listTitle', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: '', itemTitle: 'Stroller' } });
    expect(response.statusCode).toBe(400);
  });
});

async function createList() {
  const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } });
  return response.json() as { slug: string; ownerToken: string; key: string; itemId: string };
}

describe('POST /api/lists/:slug/session', () => {
  it('sets a session cookie for the correct key', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('returns a generic 404 for a wrong key', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: 'wrong-key' } });
    expect(response.statusCode).toBe(404);
  });

  it('returns the same generic 404 shape for an unknown slug', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists/no-such-slug/session', payload: { key: 'anything' } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });
});

describe('GET /api/lists/:slug', () => {
  it('returns 401 without a session cookie', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}` });
    expect(response.statusCode).toBe(401);
  });

  it('returns the list view for a valid session, with the item available', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const response = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ title: 'Baby Shower', item: { id: list.itemId, title: 'Stroller', status: 'available' } });
  });
});

describe('POST /api/lists/:slug/items/:itemId/hold', () => {
  it('holds the item and the follow-up GET reflects held status', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const holdResponse = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
    });
    expect(holdResponse.statusCode).toBe(201);
    expect(holdResponse.json()).toMatchObject({ itemId: list.itemId });

    const viewResponse = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } });
    expect(viewResponse.json()).toMatchObject({ item: { status: 'held' } });
  });

  it('returns 409 for a second hold attempt on an already-held item', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);
    await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-1' } });

    const second = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-2' } });

    expect(second.statusCode).toBe(409);
  });

  it('returns 401 without a session cookie', async () => {
    const list = await createList();
    const response = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, payload: { idempotencyKey: 'idem-1' },
    });
    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 6: Run it, confirm it fails**

```bash
cd apps/api && npx vitest run src/presentation/routes.integration.test.ts
```

Expected: FAIL — none of `compositionRoot.ts`/`routes.ts`/`app.ts` exist
until Steps 2–4 above are actually applied (write the test first per
TDD; if you're following this plan strictly top-to-bottom you'll have
already written Steps 2–4's files, in which case skip straight to
Step 7 — the important discipline is that the test was written to spec
before being confirmed passing, not the literal fail-first ceremony
when the plan already dictated the implementation).

- [ ] **Step 7: Run it, confirm it passes**

```bash
cd apps/api && npx vitest run src/presentation/routes.integration.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 8: Write the server entrypoint (no test — a thin `main()` wiring together already-tested pieces; exercised for real in Task 18's e2e test)**

Create `apps/api/src/presentation/server.ts`:

```ts
import { createDb } from '../infrastructure/db/createDb';
import { migrateToLatest } from '../infrastructure/db/migrate';
import { buildDependencies } from './compositionRoot';
import { buildApp } from './app';

async function main(): Promise<void> {
  const databasePath = process.env.DATABASE_PATH ?? './data/wishlist.db';
  const port = Number(process.env.PORT ?? 3000);
  const cookieSecret = process.env.SESSION_COOKIE_SECRET;
  if (!cookieSecret) {
    console.warn('SESSION_COOKIE_SECRET is not set — using an insecure development default. Set it in .env before deploying.');
  }

  const db = createDb(databasePath);
  await migrateToLatest(db);
  const deps = buildDependencies(db);
  const app = buildApp(deps, {
    cookieSecret: cookieSecret ?? 'dev-only-insecure-secret-change-me',
    webDist: process.env.WEB_DIST ?? new URL('../../../web/dist', import.meta.url).pathname,
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`gubbins listening on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9: Lint and full backend test run**

```bash
cd apps/api && npx eslint src && npx vitest run
```

Expected: no lint errors; every test in `apps/api` passes (domain,
application, infrastructure, presentation).

- [ ] **Step 10: Manual smoke check**

```bash
cd apps/api && DATABASE_PATH=:memory: PORT=3100 SESSION_COOKIE_SECRET=dev npx tsx src/presentation/server.ts &
sleep 1
curl -s -X POST localhost:3100/api/lists -H 'content-type: application/json' -d '{"listTitle":"Baby Shower","itemTitle":"Stroller"}'
kill %1
```

Expected: a JSON response with `slug`/`ownerToken`/`key`/`itemId`. This
is the first point in the plan where the backend actually runs as a
process, not just as tests — confirm it before moving to the front-end
tasks.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/presentation .env.example
git commit -m "feat(api): wire Fastify app, DI composition root, and routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 12: Front-end scaffold — Vite + React + TypeScript + Tailwind

Replaces the placeholder `apps/web/package.json` from Task 2 with the
real thing. This is where the front-end walkthrough starts: every
later front-end task builds directly on the pieces set up here.

**Branch:** `feat/walking-skeleton/10-web-scaffold`, off `feat/walking-skeleton/09-presentation`.

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`, `apps/web/vite.config.ts`
- Create: `apps/web/tailwind.config.js`, `apps/web/postcss.config.js`
- Create: `apps/web/index.html`
- Create: `apps/web/eslint.config.js`
- Create: `apps/web/src/index.css`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/test-setup.ts`
- Test: `apps/web/src/App.test.tsx`
- Test: `apps/web/src/eslint-feature-boundary.test.ts`

**Interfaces:**
- Produces: the `App` root component (replaced with real routing in Task 17), the Tailwind/Vitest/RTL pipeline every later front-end task assumes is already working.

- [ ] **Step 1: Replace `apps/web/package.json`**

```json
{
  "name": "@gubbins/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@gubbins/shared-types": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "@tanstack/react-query": "^5.56.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.6",
    "typescript": "^5.6.2",
    "tailwindcss": "^3.4.13",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20",
    "vitest": "^2.1.1",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/user-event": "^14.5.2",
    "msw": "^2.4.9",
    "eslint": "^9.11.1",
    "@typescript-eslint/eslint-plugin": "^8.7.0",
    "@typescript-eslint/parser": "^8.7.0",
    "eslint-plugin-react-hooks": "^4.6.2"
  }
}
```

- [ ] **Step 2: TypeScript and Vite config**

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src"]
}
```

Create `apps/web/vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev only: the built app is served by Fastify in prod (Task 17).
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 3: Tailwind config**

Create `apps/web/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

Create `apps/web/postcss.config.js`:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

Create `apps/web/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: HTML entrypoint and React bootstrap**

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>gubbins</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// staleTime avoids redundant refetches on every component mount —
// tuned here rather than left at TanStack Query's zero default.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

Create `apps/web/src/App.tsx` (a placeholder root — Task 17 replaces
this with real routing between the create-list and guest-list pages):

```tsx
export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <h1 className="text-2xl font-semibold">gubbins</h1>
    </main>
  );
}
```

Create `apps/web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Write the failing smoke test for `App`**

Create `apps/web/src/App.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'gubbins' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Install, run it, confirm it fails, then confirm it passes**

```bash
npm install
cd apps/web && npx vitest run src/App.test.tsx
```

Expected: passes immediately once the files above exist (there's no
separate red step here — `App.tsx` and the test were written together
as the initial scaffold; the discipline that matters is verifying the
whole pipeline — Vite, Vitest, jsdom, RTL, Tailwind's PostCSS plugin —
actually works end to end, which this run proves).

- [ ] **Step 7: Verify the dev build actually produces output**

```bash
cd apps/web && npx vite build
ls dist/index.html
```

Expected: `dist/index.html` exists; `npx vite build` exits 0.

- [ ] **Step 8: Feature-folder lint boundary — write the failing test**

With only two features landing in this sub-project
(`create-list` in Task 14, `holds` in Task 16), the boundary is
enforced with one `no-restricted-imports` override per feature
directory rather than a generic dependency-graph tool
(`eslint-plugin-boundaries` would be the right call if the feature
count grows much past a handful — not yet). **Task 15 must add a third
override for its own `guest-key` feature and update these two to also
exclude it** — noted again at that task so it isn't missed.

Create `apps/web/src/eslint-feature-boundary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

describe('feature-folder lint boundary', () => {
  it('flags create-list importing from holds internals', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { useHoldItem } from '../holds/useHoldItem';\nexport const x = useHoldItem;\n",
      { filePath: 'src/features/create-list/Bad.ts' },
    );
    expect(results[0].messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('allows create-list importing from the shared api boundary', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintText(
      "import { api } from '../../api/client';\nexport const x = api;\n",
      { filePath: 'src/features/create-list/Ok.ts' },
    );
    expect(results[0].messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
});
```

- [ ] **Step 9: Run it, confirm it fails, then write the ESLint config**

```bash
cd apps/web && npx vitest run src/eslint-feature-boundary.test.ts
```

Expected: FAIL — `eslint.config.js` doesn't exist yet. Then create
`apps/web/eslint.config.js`:

```js
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['src/features/create-list/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/features/holds/*'], message: "create-list may not import holds' internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
  {
    files: ['src/features/holds/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/features/create-list/*'], message: "holds may not import create-list's internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
];
```

- [ ] **Step 10: Run it, confirm it passes**

```bash
cd apps/web && npx vitest run src/eslint-feature-boundary.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 11: Full lint and test run**

```bash
cd apps/web && npx eslint src && npx vitest run
```

Expected: no lint errors; all tests pass.

- [ ] **Step 12: Commit**

```bash
git add apps/web package-lock.json
git commit -m "feat(web): scaffold Vite + React + TypeScript + Tailwind

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 13: API client boundary + MSW test setup

The one place `fetch` is called (`frontend-architecture.md`: "Nothing
else calls `fetch`"). MSW intercepts this boundary in tests instead of
mocking `fetch` directly — the professional-standard way to test
TanStack-Query-driven code, and the pattern every later feature task's
tests reuse.

**Branch:** `feat/walking-skeleton/11-api-client`, off `feat/walking-skeleton/10-web-scaffold`.

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/test/msw/server.ts`
- Modify: `apps/web/src/test-setup.ts`
- Test: `apps/web/src/api/client.test.ts`

**Interfaces:**
- Consumes: the zod schemas from `@gubbins/shared-types` (Task 3).
- Produces: `api.createList`, `api.enterGuestKey`, `api.getListView`, `api.holdItem`, and the `ApiError` class — consumed by every feature hook in Tasks 14–16. Also produces the MSW `server` test double, imported by every feature test file in Tasks 14–16.

- [ ] **Step 1: Wire MSW into the test setup**

Create `apps/web/src/test/msw/server.ts`:

```ts
import { setupServer } from 'msw/node';

export const server = setupServer();
```

Modify `apps/web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

(`onUnhandledRequest: 'error'` is deliberate: a feature test that
forgets to mock a request it makes should fail loudly, not silently
hit the network.)

- [ ] **Step 2: Write the failing test for the API client**

Create `apps/web/src/api/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { api, ApiError } from './client';

describe('api.createList', () => {
  it('parses a successful response against the shared schema', async () => {
    server.use(
      http.post('/api/lists', () =>
        HttpResponse.json({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' }, { status: 201 }),
      ),
    );

    const result = await api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    expect(result).toEqual({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' });
  });

  it('throws ApiError carrying the status and server message on a non-ok response', async () => {
    server.use(
      http.post('/api/lists', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })),
    );

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' })).rejects.toThrow(ApiError);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run src/api/client.test.ts
```

Expected: FAIL — `./client` doesn't exist yet.

- [ ] **Step 4: Implement `client.ts`**

Create `apps/web/src/api/client.ts`:

```ts
import {
  createListRequestSchema, createListResponseSchema, enterGuestKeyRequestSchema, enterGuestKeyResponseSchema,
  holdItemRequestSchema, holdItemResponseSchema, listViewResponseSchema,
  type CreateListRequest, type CreateListResponse, type EnterGuestKeyRequest, type EnterGuestKeyResponse,
  type HoldItemRequest, type HoldItemResponse, type ListViewResponse,
} from '@gubbins/shared-types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<TResponse>(
  path: string,
  init: RequestInit,
  responseSchema: { parse: (data: unknown) => TResponse },
): Promise<TResponse> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { message?: string });
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return responseSchema.parse(await response.json());
}

export const api = {
  createList: (input: CreateListRequest): Promise<CreateListResponse> =>
    request('/lists', { method: 'POST', body: JSON.stringify(createListRequestSchema.parse(input)) }, createListResponseSchema),

  enterGuestKey: (slug: string, input: EnterGuestKeyRequest): Promise<EnterGuestKeyResponse> =>
    request(
      `/lists/${slug}/session`,
      { method: 'POST', body: JSON.stringify(enterGuestKeyRequestSchema.parse(input)) },
      enterGuestKeyResponseSchema,
    ),

  getListView: (slug: string): Promise<ListViewResponse> =>
    request(`/lists/${slug}`, { method: 'GET' }, listViewResponseSchema),

  holdItem: (slug: string, itemId: string, input: HoldItemRequest): Promise<HoldItemResponse> =>
    request(
      `/lists/${slug}/items/${itemId}/hold`,
      { method: 'POST', body: JSON.stringify(holdItemRequestSchema.parse(input)) },
      holdItemResponseSchema,
    ),
};
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
cd apps/web && npx vitest run src/api/client.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 6: Lint and full test run**

```bash
cd apps/web && npx eslint src && npx vitest run
```

Expected: no lint errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/api apps/web/src/test apps/web/src/test-setup.ts
git commit -m "feat(web): add the typed API client boundary with MSW test setup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 14: Create-list feature

First feature folder: a dumb form component plus a hook that owns all
the TanStack Query logic (the testability seam per
`frontend-architecture.md`). Also the first place ADR-062 ("the owner
token never travels in a URL") has to be honored in the UI, not just
the backend — so this task tests that directly, not just trusts it.

**Branch:** `feat/walking-skeleton/12-create-list-ui`, off `feat/walking-skeleton/11-api-client`.

**Files:**
- Create: `apps/web/src/features/create-list/useCreateList.ts`
- Create: `apps/web/src/features/create-list/CreateListForm.tsx`
- Test: `apps/web/src/features/create-list/useCreateList.test.tsx`
- Test: `apps/web/src/features/create-list/CreateListForm.test.tsx`

**Interfaces:**
- Consumes: `api.createList` (Task 13).
- Produces: `<CreateListForm />` — consumed by Task 17's routing.

- [ ] **Step 1: Write the failing test for `useCreateList`**

Create `apps/web/src/features/create-list/useCreateList.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw/server';
import { useCreateList } from './useCreateList';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCreateList', () => {
  it('resolves with the created list on success', async () => {
    server.use(
      http.post('/api/lists', () =>
        HttpResponse.json({ slug: 'abc123', ownerToken: 'tok', key: 'key', itemId: 'item-1' }, { status: 201 }),
      ),
    );
    const { result } = renderHook(() => useCreateList(), { wrapper });

    result.current.mutate({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ slug: 'abc123', ownerToken: 'tok', key: 'key', itemId: 'item-1' });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, then implement `useCreateList.ts`**

```bash
cd apps/web && npx vitest run src/features/create-list/useCreateList.test.tsx
```

Expected: FAIL. Then create `apps/web/src/features/create-list/useCreateList.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { CreateListRequest } from '@gubbins/shared-types';

export function useCreateList() {
  return useMutation({
    mutationFn: (input: CreateListRequest) => api.createList(input),
  });
}
```

Run again and confirm PASS.

- [ ] **Step 3: Write the failing tests for `CreateListForm`**

Create `apps/web/src/features/create-list/CreateListForm.test.tsx`:

```tsx
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { CreateListForm } from './CreateListForm';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  renderWithQueryClient(<CreateListForm />);
  await user.type(screen.getByLabelText('List title'), 'Baby Shower');
  await user.type(screen.getByLabelText('First item'), 'Stroller');
  await user.click(screen.getByRole('button', { name: 'Create list' }));
}

describe('CreateListForm', () => {
  it('shows the guest link, guest key, and owner token after a successful submit', async () => {
    server.use(
      http.post('/api/lists', () =>
        HttpResponse.json({ slug: 'abc123', ownerToken: 'owner-secret-token', key: 'guest-key-value', itemId: 'item-1' }, { status: 201 }),
      ),
    );
    await fillAndSubmit();

    expect(await screen.findByText('guest-key-value')).toBeInTheDocument();
    expect(screen.getByText('owner-secret-token')).toBeInTheDocument();
  });

  it('never renders the owner token inside a link href (ADR-062)', async () => {
    server.use(
      http.post('/api/lists', () =>
        HttpResponse.json({ slug: 'abc123', ownerToken: 'owner-secret-token', key: 'guest-key-value', itemId: 'item-1' }, { status: 201 }),
      ),
    );
    await fillAndSubmit();
    await screen.findByText('owner-secret-token');

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toContain('owner-secret-token');
    }
  });

  it('shows the server error message when the request fails', async () => {
    server.use(http.post('/api/lists', () => HttpResponse.json({ message: 'Invalid request' }, { status: 400 })));
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid request');
  });
});
```

- [ ] **Step 4: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run src/features/create-list/CreateListForm.test.tsx
```

Expected: FAIL — `./CreateListForm` doesn't exist yet.

- [ ] **Step 5: Implement `CreateListForm.tsx`**

```tsx
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useCreateList } from './useCreateList';

export function CreateListForm() {
  const [listTitle, setListTitle] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const { mutate, data, error, isPending } = useCreateList();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate({ listTitle, itemTitle });
  }

  if (data) {
    return (
      <div className="max-w-sm space-y-3">
        <p>Your list is ready.</p>
        <div>
          <p className="text-sm font-medium">Guest link</p>
          <a className="text-blue-600 underline" href={`/${data.slug}`}>
            {window.location.origin}/{data.slug}
          </a>
        </div>
        <div>
          <p className="text-sm font-medium">Guest key</p>
          <p className="font-mono">{data.key}</p>
        </div>
        <div>
          {/* Never rendered inside a link — ADR-062: the owner token must never travel in a URL. */}
          <p className="text-sm font-medium">Owner token — keep this private</p>
          <p className="break-all font-mono">{data.ownerToken}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="list-title" className="block text-sm font-medium">List title</label>
        <input
          id="list-title" required value={listTitle} onChange={(e) => setListTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="item-title" className="block text-sm font-medium">First item</label>
        <input
          id="item-title" required value={itemTitle} onChange={(e) => setItemTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {error && <p role="alert" className="text-red-600">{error.message}</p>}
      <button
        type="submit" disabled={isPending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create list'}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Run it, confirm it passes**

```bash
cd apps/web && npx vitest run src/features/create-list
```

Expected: PASS, all cases in both test files.

- [ ] **Step 7: Lint**

```bash
cd apps/web && npx eslint src/features/create-list
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/create-list
git commit -m "feat(web): add the create-list feature

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 15: Guest key-gate feature

The guest-facing entry point: enter the key, get in. Per
[access & identity](../spec/access-identity.md), ADR-016/054, the
backend already returns the same generic not-found response whether
the slug or the key is wrong — this component must not try to be
smarter than that response and infer a more specific message.

**Branch:** `feat/walking-skeleton/13-guest-key-ui`, off `feat/walking-skeleton/12-create-list-ui`.

**Files:**
- Create: `apps/web/src/features/guest-key/useEnterGuestKey.ts`
- Create: `apps/web/src/features/guest-key/GuestKeyGate.tsx`
- Modify: `apps/web/eslint.config.js` (add the third feature-boundary override, per Task 12 Step 8's note)
- Test: `apps/web/src/features/guest-key/GuestKeyGate.test.tsx`

**Interfaces:**
- Consumes: `api.enterGuestKey` (Task 13).
- Produces: `<GuestKeyGate slug onSuccess />` — consumed by Task 17's routing.

- [ ] **Step 1: Add the third feature-boundary lint override**

Modify `apps/web/eslint.config.js`: update the two existing overrides
to also exclude `guest-key`, and add a third block for it:

```js
  {
    files: ['src/features/create-list/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/features/holds/*', '**/features/guest-key/*'], message: "create-list may not import another feature's internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
  {
    files: ['src/features/holds/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/features/create-list/*', '**/features/guest-key/*'], message: "holds may not import another feature's internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
  {
    files: ['src/features/guest-key/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/features/create-list/*', '**/features/holds/*'], message: "guest-key may not import another feature's internals — go through src/api/ or a shared UI primitive." }] }],
    },
  },
```

(Replace the two existing override blocks with the first two above —
same `files` glob, just an added pattern each — and append the third.)

- [ ] **Step 2: Write the failing test for `useEnterGuestKey`**

Create `apps/web/src/features/guest-key/useEnterGuestKey.test.tsx` is
skipped in favor of testing it through `GuestKeyGate` directly below —
the hook has no behavior of its own beyond wrapping `api.enterGuestKey`
in a mutation (same shape as `useCreateList`, already proven in
Task 14), so a separate hook-level test here would just re-assert
TanStack Query's own `useMutation` behavior a second time.

- [ ] **Step 3: Write the failing tests for `GuestKeyGate`**

Create `apps/web/src/features/guest-key/GuestKeyGate.test.tsx`:

```tsx
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { GuestKeyGate } from './GuestKeyGate';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('GuestKeyGate', () => {
  it('calls onSuccess after a valid key is accepted', async () => {
    server.use(http.post('/api/lists/abc123/session', () => HttpResponse.json({ ok: true }, { status: 200 })));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Enter the guest key'), 'correct-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('shows the same generic not-found message on a wrong key as on any other failure', async () => {
    server.use(http.post('/api/lists/abc123/session', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={() => {}} />);

    await user.type(screen.getByLabelText('Enter the guest key'), 'wrong-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This list could not be found.');
  });
});
```

- [ ] **Step 4: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run src/features/guest-key/GuestKeyGate.test.tsx
```

Expected: FAIL — neither file exists yet.

- [ ] **Step 5: Implement `useEnterGuestKey.ts` and `GuestKeyGate.tsx`**

Create `apps/web/src/features/guest-key/useEnterGuestKey.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { EnterGuestKeyRequest } from '@gubbins/shared-types';

export function useEnterGuestKey(slug: string) {
  return useMutation({
    mutationFn: (input: EnterGuestKeyRequest) => api.enterGuestKey(slug, input),
  });
}
```

Create `apps/web/src/features/guest-key/GuestKeyGate.tsx`:

```tsx
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useEnterGuestKey } from './useEnterGuestKey';

export interface GuestKeyGateProps {
  slug: string;
  onSuccess: () => void;
}

export function GuestKeyGate({ slug, onSuccess }: GuestKeyGateProps) {
  const [key, setKey] = useState('');
  const { mutate, error, isPending } = useEnterGuestKey(slug);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate({ key }, { onSuccess });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="guest-key" className="block text-sm font-medium">Enter the guest key</label>
        <input
          id="guest-key" required value={key} onChange={(e) => setKey(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {/* Deliberately generic regardless of the underlying reason — ADR-016/054: no distinguishing "wrong key" from "no such list." */}
      {error && <p role="alert" className="text-red-600">This list could not be found.</p>}
      <button
        type="submit" disabled={isPending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Checking…' : 'View list'}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Run it, confirm it passes**

```bash
cd apps/web && npx vitest run src/features/guest-key/GuestKeyGate.test.tsx
```

Expected: PASS, both cases.

- [ ] **Step 7: Lint and full test run**

```bash
cd apps/web && npx eslint src && npx vitest run
```

Expected: no lint errors (including the updated three-way feature
boundary); all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/guest-key apps/web/eslint.config.js
git commit -m "feat(web): add the guest key-gate feature

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 16: Holds feature — item view, native `<dialog>` hold sheet, ARIA live announcement

The payoff task for the front-end a11y ADRs: the confirm sheet is a
real `<dialog>` (ADR-024), and the held-state change is announced via
`role="status"`/`aria-live="polite"` (ADR-025) — not just a color
change a screen-reader user would miss.

`jsdom` does not fully implement `HTMLDialogElement.showModal()`/
`close()` — calling them logs a harmless "not implemented" message to
the console during tests. That's expected noise, not a failure; the
tests below assert on the dialog's *content* and the component's
state, not on jsdom actually rendering a native modal.

**Branch:** `feat/walking-skeleton/14-holds-ui`, off `feat/walking-skeleton/13-guest-key-ui`.

**Files:**
- Create: `apps/web/src/features/holds/useListView.ts`
- Create: `apps/web/src/features/holds/useHoldItem.ts`
- Create: `apps/web/src/features/holds/HeldAnnouncement.tsx`
- Create: `apps/web/src/features/holds/HoldDialog.tsx`
- Create: `apps/web/src/features/holds/ItemView.tsx`
- Test: `apps/web/src/features/holds/ItemView.test.tsx`

**Interfaces:**
- Consumes: `api.getListView`, `api.holdItem` (Task 13).
- Produces: `<ItemView slug listTitle item />` and `useListView(slug)` — both consumed by Task 17's routing (`useListView` also drives the key-gate-vs-item-view branch there).

- [ ] **Step 1: Write `useListView` and `useHoldItem` (no separate test files — both are thin `useQuery`/`useMutation` wrappers with no logic of their own beyond the API call, same rationale as Task 15 Step 2; `ItemView.test.tsx` below exercises `useHoldItem` through real interaction)**

Create `apps/web/src/features/holds/useListView.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export function useListView(slug: string) {
  return useQuery({
    queryKey: ['listView', slug],
    queryFn: () => api.getListView(slug),
  });
}
```

Create `apps/web/src/features/holds/useHoldItem.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { HoldItemRequest } from '@gubbins/shared-types';

export function useHoldItem(slug: string, itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HoldItemRequest) => api.holdItem(slug, itemId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listView', slug] });
    },
  });
}
```

- [ ] **Step 2: Write the failing tests for `ItemView`**

Create `apps/web/src/features/holds/ItemView.test.tsx`:

```tsx
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { ItemView } from './ItemView';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('ItemView', () => {
  it('shows a Hold button for an available item, then confirms and holds it', async () => {
    server.use(
      http.post('/api/lists/abc123/items/item-1/hold', () =>
        HttpResponse.json({ holdId: 'hold-1', itemId: 'item-1', expiresAt: '2026-01-04T00:00:00.000Z' }, { status: 201 }),
      ),
    );
    const user = userEvent.setup();
    renderWithQueryClient(
      <ItemView slug="abc123" listTitle="Baby Shower" item={{ id: 'item-1', title: 'Stroller', status: 'available' }} />,
    );

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Stroller is held.');
  });

  it('renders an already-held item as held immediately, with no Hold button', () => {
    renderWithQueryClient(
      <ItemView slug="abc123" listTitle="Baby Shower" item={{ id: 'item-1', title: 'Stroller', status: 'held' }} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Stroller is held.');
    expect(screen.queryByRole('button', { name: 'Hold this item' })).not.toBeInTheDocument();
  });

  it('shows the server error message in the dialog when the hold request fails', async () => {
    server.use(http.post('/api/lists/abc123/items/item-1/hold', () => HttpResponse.json({ message: 'Item already held' }, { status: 409 })));
    const user = userEvent.setup();
    renderWithQueryClient(
      <ItemView slug="abc123" listTitle="Baby Shower" item={{ id: 'item-1', title: 'Stroller', status: 'available' }} />,
    );

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Item already held');
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd apps/web && npx vitest run src/features/holds/ItemView.test.tsx
```

Expected: FAIL — none of `HeldAnnouncement`/`HoldDialog`/`ItemView` exist yet.

- [ ] **Step 4: Implement `HeldAnnouncement.tsx`**

```tsx
export interface HeldAnnouncementProps {
  message: string;
}

/** role="status" + aria-live="polite" together, explicitly — ADR-025: screen-reader status changes use ARIA live regions. */
export function HeldAnnouncement({ message }: HeldAnnouncementProps) {
  return (
    <p role="status" aria-live="polite" className="font-medium text-green-700">
      {message}
    </p>
  );
}
```

- [ ] **Step 5: Implement `HoldDialog.tsx`**

```tsx
import { useEffect, useRef } from 'react';

export interface HoldDialogProps {
  itemTitle: string;
  isOpen: boolean;
  isPending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** A real <dialog> — ADR-024: hold sheet and contribute flow use native <dialog>. */
export function HoldDialog({ itemTitle, isOpen, isPending, error, onConfirm, onClose }: HoldDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog ref={dialogRef} onClose={onClose} className="rounded-lg p-6 backdrop:bg-black/50">
      <p className="mb-4">Hold &ldquo;{itemTitle}&rdquo; for yourself?</p>
      {error && <p role="alert" className="mb-4 text-red-600">{error.message}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onConfirm} disabled={isPending} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {isPending ? 'Holding…' : 'Yes, hold it'}
        </button>
        <button type="button" onClick={onClose} className="rounded border px-4 py-2">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 6: Implement `ItemView.tsx`**

```tsx
import { useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { HoldDialog } from './HoldDialog';
import { HeldAnnouncement } from './HeldAnnouncement';

export interface ItemViewProps {
  slug: string;
  listTitle: string;
  item: ListViewResponse['item'];
}

export function ItemView({ slug, listTitle, item }: ItemViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { mutate, isPending, error, isSuccess } = useHoldItem(slug, item.id);

  function handleConfirm() {
    // Client-generated idempotency key — ADR-048.
    mutate({ idempotencyKey: crypto.randomUUID() }, { onSuccess: () => setDialogOpen(false) });
  }

  const isHeld = item.status === 'held' || isSuccess;

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">{listTitle}</h1>
      <p>{item.title}</p>
      {isHeld ? (
        <HeldAnnouncement message={`${item.title} is held.`} />
      ) : (
        <button type="button" onClick={() => setDialogOpen(true)} className="rounded bg-slate-900 px-4 py-2 text-white">
          Hold this item
        </button>
      )}
      <HoldDialog
        itemTitle={item.title}
        isOpen={dialogOpen}
        isPending={isPending}
        error={error}
        onConfirm={handleConfirm}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run it, confirm it passes**

```bash
cd apps/web && npx vitest run src/features/holds/ItemView.test.tsx
```

Expected: PASS, all three cases (jsdom's "not implemented"
`showModal`/`close` console noise is expected — don't chase it).

- [ ] **Step 8: Lint and full test run**

```bash
cd apps/web && npx eslint src && npx vitest run
```

Expected: no lint errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/holds
git commit -m "feat(web): add the holds feature (item view, hold dialog, ARIA live announcement)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 17: Wire it together — routing, code-splitting, static serving

After this task the app is usable end-to-end in a real browser: create
a list, open the guest link, enter the key, hold the item.

**Branch:** `feat/walking-skeleton/15-wire-it-together`, off `feat/walking-skeleton/14-holds-ui`.

**Files:**
- Create: `apps/web/src/pages/CreateListPage.tsx`
- Create: `apps/web/src/pages/ListPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx` (the Task 12 placeholder test asserted a static heading that no longer exists)

**Interfaces:**
- Consumes: `<CreateListForm />` (Task 14), `<GuestKeyGate />` (Task 15), `<ItemView />` + `useListView` (Task 16).
- Produces: the final `App` component — nothing later in this plan builds on top of it (Task 18 drives it via a real browser instead).

- [ ] **Step 1: Write the page components**

Create `apps/web/src/pages/CreateListPage.tsx`:

```tsx
import { CreateListForm } from '../features/create-list/CreateListForm';

export default function CreateListPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <h1 className="mb-6 text-2xl font-semibold">Create a wishlist</h1>
      <CreateListForm />
    </main>
  );
}
```

Create `apps/web/src/pages/ListPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { useListView } from '../features/holds/useListView';
import { GuestKeyGate } from '../features/guest-key/GuestKeyGate';
import { ItemView } from '../features/holds/ItemView';

export default function ListPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;

  const query = useListView(slug);

  if (query.status === 'pending') {
    return <main className="min-h-screen bg-slate-50 p-6">Loading…</main>;
  }

  if (query.status === 'error') {
    // Any error here — 401 (no session yet) or 404 (unknown slug) — means
    // "not authenticated yet"; the backend already collapses both into
    // the same generic shape (ADR-016/054), so this branch doesn't need
    // to (and mustn't) distinguish further.
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <GuestKeyGate slug={slug} onSuccess={() => query.refetch()} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <ItemView slug={slug} listTitle={query.data.title} item={query.data.item} />
    </main>
  );
}
```

- [ ] **Step 2: Wire routing with code-splitting into `App.tsx`**

Replace the contents of `apps/web/src/App.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

// Route-level code-splitting, established now with two routes so the
// pattern is already in place when more pages (owner dashboard, etc.)
// land in later sub-projects.
const CreateListPage = lazy(() => import('./pages/CreateListPage'));
const ListPage = lazy(() => import('./pages/ListPage'));

const router = createBrowserRouter([
  { path: '/', element: <CreateListPage /> },
  { path: '/:slug', element: <ListPage /> },
]);

export default function App() {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
```

- [ ] **Step 3: Update `App.test.tsx`**

The Task 12 placeholder test asserted a static "gubbins" heading that
no longer exists now that `App` renders real routes. Replace
`apps/web/src/App.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

describe('App', () => {
  it('renders the create-list page at the root path', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Create a wishlist' })).toBeInTheDocument();
  });
});
```

(`findByRole` — not `getByRole` — because `CreateListPage` is behind
`React.lazy`; the heading only appears once the chunk resolves.)

- [ ] **Step 4: Run the front-end test suite, confirm it passes**

```bash
cd apps/web && npx vitest run
```

Expected: PASS, including the updated `App.test.tsx`.

- [ ] **Step 5: Lint, typecheck, and build the front-end**

```bash
cd apps/web && npx eslint src && npx tsc --noEmit && npx vite build
ls dist/index.html
```

Expected: no errors; `dist/index.html` and a JS chunk per lazy route exist.

- [ ] **Step 6: Check the guest-flow bundle against the Pi-class performance budget**

[`performance-and-resource-budget.md`](../spec/performance-and-resource-budget.md)
(ADR-029) sets a concrete number: guest-flow JS under 150KB gzipped
(the owner-facing `CreateListPage` chunk has no such ceiling — far
fewer users, less latency-sensitive). Route-level code-splitting from
Step 2 means the guest path's actual payload is the shared
vendor/runtime chunk plus the `ListPage` chunk specifically, not the
whole `dist/` output:

```bash
cd apps/web
guest_bytes=$(cat dist/assets/ListPage-*.js $(ls dist/assets/*.js | grep -v -e 'ListPage-' -e 'CreateListPage-') | gzip -9 | wc -c)
echo "Guest-flow JS (gzipped): ${guest_bytes} bytes (budget: 153600)"
if [ "$guest_bytes" -ge 153600 ]; then
  echo "OVER BUDGET"
  exit 1
fi
echo "OK: under the 150KB guest-flow budget"
```

Expected: `OK: under the 150KB guest-flow budget`. This walking
skeleton's guest path is small enough that this should pass
comfortably today — the check's value is catching *regressions* as
later sub-projects add guest-facing features, not proving anything
remarkable about this task's own output.

- [ ] **Step 7: Confirm the backend's static-serving path actually points at this build**

```bash
grep -n "WEB_DIST\|web/dist" apps/api/src/presentation/server.ts
```

Expected: the line from Task 11 resolving `../../../web/dist` relative
to `server.ts` — confirm the path arithmetic (`presentation/` →
`src/` → `api/` → `apps/` → `web/dist`) actually lands on the
`apps/web/dist` you just built. No code change needed here if it
checks out; fix the relative path in `server.ts` if it doesn't.

- [ ] **Step 8: Confirm the docker-compose/env alignment (no Docker execution required — this is a static check)**

```bash
grep -A2 'ports:' docker-compose.yml
grep -E 'PORT|DATABASE_PATH|SESSION_COOKIE_SECRET' .env.example
```

Expected: `docker-compose.yml` maps `"3000:3000"`, and `.env.example`'s
`PORT=3000` / `DATABASE_PATH=/workspace/data/wishlist.db` /
`SESSION_COOKIE_SECRET=` (added in Task 11) line up with what
`server.ts` reads — no mismatch to fix.

- [ ] **Step 9: Full end-to-end manual smoke test via curl (the real browser check is Task 18's Playwright test — this just proves the built server serves both the API and the static bundle from one process)**

```bash
cd apps/api && DATABASE_PATH=/tmp/gubbins-smoke.db PORT=3100 SESSION_COOKIE_SECRET=dev npx tsx src/presentation/server.ts &
sleep 1
curl -s localhost:3100/ | grep -o '<div id="root">'
list=$(curl -s -X POST localhost:3100/api/lists -H 'content-type: application/json' -d '{"listTitle":"Baby Shower","itemTitle":"Stroller"}')
echo "$list"
slug=$(echo "$list" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).slug))")
key=$(echo "$list" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).key))")
curl -s -c /tmp/gubbins-cookies.txt -X POST "localhost:3100/api/lists/$slug/session" -H 'content-type: application/json' -d "{\"key\":\"$key\"}"
curl -s -b /tmp/gubbins-cookies.txt "localhost:3100/api/lists/$slug"
kill %1
rm -f /tmp/gubbins-smoke.db /tmp/gubbins-cookies.txt
```

Expected: the static-serving check finds `<div id="root">` in the HTML
(this only works if `WEB_DIST` points at a real built `apps/web/dist`
from Step 5); the create-list call returns the four fields; the
session call sets a cookie; the final GET returns
`{"title":"Baby Shower","item":{...,"status":"available"}}`.

- [ ] **Step 10: Full workspace fan-out — final check before this PR**

```bash
npm run lint
npm run test
npm run build
```

Expected: all three succeed across all three workspaces (`apps/api`,
`apps/web`, `packages/shared-types`) — this is the `npm run
lint|test|build --workspaces --if-present` fan-out from Task 2, now
exercised for real with every workspace fully populated.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/pages apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): wire routing, code-splitting, and confirm backend static serving

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 18: End-to-end test — Playwright + axe-core

The actual proof of "end-to-end working software": one real browser
driving the full stack through the built server, with an accessibility
scan on both pages. This also needs a CI job with a browser install
step — the existing `.github/workflows/ci.yml` `build` job's
`npm run test --if-present` fan-out does **not** cover this (Playwright
needs `npx playwright install`), so this task adds a dedicated job.

**Branch:** `feat/walking-skeleton/16-e2e-and-verification`, off `feat/walking-skeleton/15-wire-it-together` (this task and Task 19 share this branch/PR).

**Files:**
- Modify: `package.json` (root — add Playwright/axe devDependencies and a `test:e2e` script)
- Create: `playwright.config.ts` (root)
- Create: `e2e/walking-skeleton.spec.ts`
- Modify: `apps/api/package.json` (add a non-watch `start` script)
- Modify: `apps/web/src/features/create-list/CreateListForm.tsx` (add `data-testid` attributes for stable e2e selectors)
- Modify: `.github/workflows/ci.yml` (add an `e2e` job)

**Interfaces:**
- Consumes: the fully built `apps/api` + `apps/web` from every prior task.
- Produces: nothing further tasks build on — this is the plan's terminal proof.

- [ ] **Step 1: Add a non-watch start script to `apps/api`**

Modify `apps/api/package.json`'s `scripts`, adding:

```json
"start": "tsx src/presentation/server.ts"
```

- [ ] **Step 2: Add stable selectors to `CreateListForm`'s success view**

Modify `apps/web/src/features/create-list/CreateListForm.tsx`: add
`data-testid` attributes to the three success-view elements (the
existing RTL tests from Task 14 use role/text queries and are
unaffected):

```tsx
        <div>
          <p className="text-sm font-medium">Guest link</p>
          <a data-testid="guest-link" className="text-blue-600 underline" href={`/${data.slug}`}>
            {window.location.origin}/{data.slug}
          </a>
        </div>
        <div>
          <p className="text-sm font-medium">Guest key</p>
          <p data-testid="guest-key" className="font-mono">{data.key}</p>
        </div>
        <div>
          {/* Never rendered inside a link — ADR-062: the owner token must never travel in a URL. */}
          <p className="text-sm font-medium">Owner token — keep this private</p>
          <p data-testid="owner-token" className="break-all font-mono">{data.ownerToken}</p>
        </div>
```

- [ ] **Step 3: Add Playwright/axe to the root `package.json`**

Modify the root `package.json`: add a `devDependencies` block (there
isn't one yet — only `dependencies`-free workspace scripts existed
before) and a `test:e2e` script:

```json
"scripts": {
  "test": "bats scripts/test && npm run test --workspaces --if-present",
  "test:e2e": "playwright test",
  "lint": "npm run lint --workspaces --if-present",
  "build": "npm run build --workspaces --if-present"
},
"devDependencies": {
  "@playwright/test": "^1.47.2",
  "@axe-core/playwright": "^4.10.0"
}
```

- [ ] **Step 4: Write the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build --workspace=apps/web && npm run start --workspace=apps/api',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: '3100',
      DATABASE_PATH: ':memory:',
      SESSION_COOKIE_SECRET: 'e2e-test-secret',
      WEB_DIST: path.resolve(__dirname, 'apps/web/dist'),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 5: Install and run — confirm the harness itself works before writing the real test**

```bash
npm install
npx playwright install --with-deps chromium
```

Expected: both succeed. (No test file exists yet — this step is purely
about getting the browser binary and config validated before Step 6.)

- [ ] **Step 6: Write the end-to-end test**

Create `e2e/walking-skeleton.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('owner creates a list, guest enters the key, and holds the item', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('List title').fill('Baby Shower');
  await page.getByLabel('First item').fill('Stroller');
  await page.getByRole('button', { name: 'Create list' }).click();

  const guestLinkHref = await page.getByTestId('guest-link').getAttribute('href');
  const guestKey = (await page.getByTestId('guest-key').textContent())?.trim();
  expect(guestLinkHref).toBeTruthy();
  expect(guestKey).toBeTruthy();

  const createPageScan = await new AxeBuilder({ page }).analyze();
  const createPageSerious = createPageScan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(createPageSerious).toEqual([]);

  // A separate browser tab in the same context stands in for the guest,
  // who is a different person on a different device in reality.
  const guestPage = await context.newPage();
  await guestPage.goto(guestLinkHref!);
  await guestPage.getByLabel('Enter the guest key').fill(guestKey!);
  await guestPage.getByRole('button', { name: 'View list' }).click();

  await expect(guestPage.getByText('Stroller')).toBeVisible();
  await guestPage.getByRole('button', { name: 'Hold this item' }).click();
  await guestPage.getByRole('button', { name: 'Yes, hold it' }).click();
  await expect(guestPage.getByRole('status')).toHaveText('Stroller is held.');

  const guestPageScan = await new AxeBuilder({ page: guestPage }).analyze();
  const guestPageSerious = guestPageScan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(guestPageSerious).toEqual([]);
});
```

- [ ] **Step 7: Run it, confirm it passes**

```bash
npx playwright test
```

Expected: 1 passed. If it fails on a selector, the most likely cause is
a mismatch between this test's `getByLabel`/`getByRole` queries and the
actual accessible names rendered by Tasks 14–16 — check those files
before assuming the test itself is wrong. If it fails on the axe scan,
read the reported violation and fix the underlying markup; don't
silence the check by loosening the `impact` filter (ADR-026 draws the
line at serious/critical for a reason — it is not a suggestion to move
if a scan finds something real).

- [ ] **Step 8: Add the CI job**

Modify `.github/workflows/ci.yml`, adding a new job alongside the
existing `verify-signatures` and `build` jobs:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24.17"
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/web/src/features/create-list/CreateListForm.tsx \
        package.json package-lock.json playwright.config.ts e2e .github/workflows/ci.yml
git commit -m "test(e2e): add Playwright + axe-core end-to-end test and CI job

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```

---

## Task 19: Final verification sweep against the design spec's Definition of Done

Read-only verification — no new code. If any step fails, fix it in
whichever earlier task's files are responsible and rerun every step
from Step 1 (not just the failing one), since a fix can reintroduce a
break an earlier step already cleared. Same branch as Task 18 — this
task's fixes, if any, land as follow-up commits on
`feat/walking-skeleton/16-e2e-and-verification` before that PR is
opened for review.

**Files:** none modified unless a check fails.

- [ ] **Step 1: ADRs 0071–0074 are recorded and indexed**

```bash
python3 scripts/check_adr_links.py
grep -c '^| \[07[1-4]\]' docs/adr/README.md
```

Expected: `All links resolve.`; the grep prints `4`.

- [ ] **Step 2: Full workspace fan-out passes clean from a fresh install**

```bash
rm -rf node_modules apps/api/node_modules apps/web/node_modules packages/shared-types/node_modules
npm install
npm run lint
npm run test
npm run build
```

Expected: all four commands succeed. This is deliberately a from-scratch
install, not a reuse of whatever `node_modules` state earlier tasks left
behind — it's the closest this plan gets to what a new contributor's
first `npm install` will actually experience.

- [ ] **Step 3: The Clean Architecture boundary is still enforced**

```bash
cd apps/api && npx vitest run src/eslint-boundary.test.ts
cd ../web && npx vitest run src/eslint-feature-boundary.test.ts
```

Expected: both PASS — confirms no later task accidentally weakened the
lint config while wiring things together.

- [ ] **Step 4: The end-to-end test passes with zero serious/critical axe violations**

```bash
npx playwright test
```

Expected: 1 passed (already verified in Task 18 — this rerun confirms
nothing in this task's own fresh-install/build cycle broke it).

- [ ] **Step 5: The ten-minute self-hosted setup actually works**

If Docker is available in the environment running this plan:

```bash
npm run build
docker compose up -d --build
sleep 2
curl -s localhost:3000/ | grep -o '<div id="root">'
docker compose down
```

Expected: the static bundle is served through the real
`docker-compose.yml` path (not just Playwright's `webServer`
shortcut). If Docker isn't available in this environment (e.g. a
sandboxed devcontainer without nested Docker), skip this step and
note it explicitly in the PR description as "not verified in this
environment — needs a manual check on a host with Docker" rather than
silently passing over it.

- [ ] **Step 6: If every check above passes (or Step 5 is explicitly noted as
  environment-limited), the walking skeleton is complete.**

No commit for this task unless a fix was needed above. Update the
design spec's status: modify
`docs/superpowers/specs/2026-09-12-walking-skeleton-design.md`,
changing `**Status:** Draft` to `**Status:** Implemented`, and commit
that one-line change:

```bash
git add docs/superpowers/specs/2026-09-12-walking-skeleton-design.md
git commit -m "docs: mark the walking-skeleton design spec as implemented

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012MPtqHFcW9Zj5vT6ih52Qp"
```
