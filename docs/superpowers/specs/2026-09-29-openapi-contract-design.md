# OpenAPI contract, folded into the walking-skeleton stack — design

**Status:** Draft
**Branches:** walking-skeleton stack PRs #6–#20 (`feat/walking-skeleton/02-monorepo` … `16-e2e-and-verification`), restacked
**Date:** 2026-09-29
**Origin:** review thread on PR #15, <https://github.com/dtbiedrzycki/gubbins/pull/15#discussion_r4133668213>

## Purpose

The web client's payload shapes cannot drift from the server's, because both
use the zod schemas in `@gubbins/shared-types`. But the route table can drift:
paths, methods and status codes are written in `routes.ts`, again in
`apps/web/src/api/client.ts`, and a third time in the web tests' MSW
handlers. A renamed server route would leave the web unit tests passing, and
only the Playwright e2e test would catch it.

Goal: make one generated OpenAPI document the API contract. Every consumer
(the web client, its test mocks, and future non-web clients, which the owner
expects) derives its types from it, and a stale document fails `npm test`.

## Decisions (made with the owner during brainstorming)

| Decision | Choice |
|---|---|
| Approach | OpenAPI generated from zod route schemas, over a hand-rolled TypeScript contract. Chosen because other clients are expected. |
| Where it lands | Folded into the stack: each change goes into the PR that introduced the code it changes. It is not a separate follow-up PR. |
| zod version | Upgrade to zod 4 in #6, so `fastify-type-provider-zod` 7.x (current, requires zod ≥ 4.1.5) can be used. |
| Publishing the spec | A committed file only (`apps/api/openapi.json`). No runtime route and no Swagger UI. |
| Web client runtime validation | Dropped. The server's zod serializer already refuses a non-conforming response. The web client depends on the generated types only. |
| API versioning | Lay the foundation only: the spec carries the release version, and ADR-0077 records the pre-1.0 policy and a 1.0 checklist item. There is no URL prefix, version route or breaking-change CI check yet. |

## Non-goals

- No change to the API itself: the same paths, methods, status codes and
  response bodies. The one addition is that the spec now documents the 400
  that routes with a body already return.
- No served spec, no Swagger UI, no URL version prefix (`/api/v1`), no
  runtime version route and no breaking-change detection in CI. Each can be
  added later without changing the rest of this design. See
  [API versioning](#api-versioning) for when.
- No new CI jobs or steps. Freshness is enforced through `npm test`.
- No change to the web's feature code, which keeps its `@gubbins/shared-types`
  type imports.

## Design

### #6 `02-monorepo`: zod 4

- Bump `zod` to 4.x in `packages/shared-types` and `apps/api`, and in any
  other workspace that declares it.
- Adapt any schema whose behaviour changed in zod 4. Where an adaptation is
  not mechanical, call it out in the PR description rather than working
  around it.
- The existing `shared-types` tests must pass.

### #13 `09-presentation`: route schemas generate the contract

- **Dependencies:** `fastify-type-provider-zod` 7.x and `@fastify/swagger`.
- **`app.ts`:** set the provider's `validatorCompiler` and
  `serializerCompiler`, and register `@fastify/swagger` with
  `jsonSchemaTransform` and `info: { title: 'gubbins', version }`, where
  `version` is the root `package.json` `version` (currently `0.0.0`). It is
  registered before the routes.
- **`routes.ts`:**
  - Use `app.withTypeProvider<ZodTypeProvider>()`. Each route declares
    `schema: { operationId, params?, body?, response }`.
  - `response` lists every status the route returns:

    | operationId | Statuses |
    |---|---|
    | `createList` | 201, 400 |
    | `enterGuestKey` | 200, 400, 404 |
    | `getListView` | 200, 404 |
    | `holdItem` | 201, 400, 404, 409 |

  - `params` schemas are defined in `routes.ts`, because path parameters are
    an HTTP concern. `shared-types` remains body shapes only, as its header
    comment says.
  - Remove the `request.params as {…}` casts and the manual `.parse()` calls
    on request bodies and replies.
  - Handler logic does not change: the domain calls, the generic 404s
    (ADR-016/054), the session cookie, and the `SessionPayload` binding.
- **Error handler (`app.ts`):**
  - A request validation failure returns
    `400 { message: 'Invalid request', issues }`, the same body as today.
    The handler detects the provider's validation error (its
    `hasZodFastifySchemaValidationErrors` helper, or the equivalent in 7.x)
    in place of `ZodError`. `issues` carries zod's issues so that the body
    stays compatible.
  - A response that fails its schema (the provider's response serialization
    error) is a server bug: log it with `deps.logger.logError` and return a
    generic 500, the same as any other unhandled error.
  - Any other `ZodError` thrown from a handler keeps its current treatment.
- **Spec emission:**
  - `apps/api/scripts/emit-openapi.ts` builds the app with test-safe
    dependencies, calls `ready()` without listening on a port, and writes
    `apps/api/openapi.json` (pretty-printed with a trailing newline, so the
    diff is stable).
  - `apps/api` gets a `gen:openapi` script.
  - The root `gen:api` script runs `gen:openapi` and then the web
    `gen:api-types` script (defined in #15).
- **Freshness test:** `apps/api/src/presentation/openapi.test.ts` generates
  the spec in memory and asserts that it equals the committed file. On
  failure it says: "run `npm run gen:api`".
- **ADR-0077**, "The OpenAPI document generated from route schemas is the
  API contract". It records:
  - zod stays the source of truth, and `openapi.json` is a committed, derived
    artifact
  - consumers generate their types from `openapi.json`
  - the alternatives rejected: a hand-rolled TypeScript contract (a
    TypeScript-only consumer model), ts-rest (`@ts-rest/fastify` declares
    Fastify 4 support only), and tRPC (it replaces REST)
  - the versioning policy and the 1.0 checklist item in
    [API versioning](#api-versioning)

  The ADR is added in #13, following the stack's convention that an ADR is
  added in the same PR as the feature it describes.

### #15 `11-api-client`: generated types and the client

- **Dependencies:** `openapi-fetch`, and `openapi-typescript` as a dev
  dependency.
- **Generated types:** `apps/web/src/api/schema.gen.ts` is generated from
  `apps/api/openapi.json` by the `gen:api-types` script. It is committed,
  starts with a "generated — do not edit" header, and is excluded from
  ESLint.
- **`client.ts`:**
  - Uses `createClient<paths>({ baseUrl: '/', credentials: 'same-origin' })`.
  - The public `api.createList`, `enterGuestKey`, `getListView` and
    `holdItem` keep their current signatures and return types.
  - A non-2xx response throws `ApiError(status, message)`, as today.
  - There is no zod parse on the client.
  - `openapi-fetch` is used only inside `src/api/`, so the rule "nothing
    else calls `fetch`" still holds.
- **`src/test/msw/mock.ts`:** `mock(method, path, status, body)`.
  - Its types come from `paths`: the path must be in the spec, the status
    must be one that path and method list, and the body must match that
    status. The status type parameter is inferred separately from its
    constraint, and the body uses `NoInfer`; both were verified in the
    prototype.
  - At runtime it converts `{param}` to `:param` for MSW.
  - The rejections above are pinned by `@ts-expect-error` cases that the
    web `tsc --noEmit` run checks.
  - `openapi-msw` is not used, because it does not support MSW 3.
- **Freshness test:** `apps/web/src/api/schema.gen.test.ts` runs
  `openapi-typescript`'s programmatic API on the committed `openapi.json` and
  asserts that the output equals `schema.gen.ts`, with the same "run
  `npm run gen:api`" message.
- **`client.test.ts`** uses `mock()`.

### #16–#18 (`12-create-list-ui`, `13-guest-key-ui`, `14-holds-ui`): the feature tests

- Every hand-written `http.post/get('/api/...')` becomes
  `mock('post' | 'get', '/api/lists/{slug}/...', status, body)`.
- The assertions do not change.
- The mocks now match any `slug` and `itemId`. That is safe, because each
  test renders a single list.

### #19 `15-wire-it-together` and #20 `16-e2e-and-verification`

- No change expected beyond the rebase.
- The Playwright e2e test runs against the real server and is the final
  proof.

### Documentation

- **In #13, with ADR-0077:** `docs/spec/frontend-architecture.md` line 8
  changes to say that front-end API types are generated from the OpenAPI
  document, which is itself generated from the zod route schemas.
- **In #23 (this branch):** `docs/superpowers/plans/2026-09-12-walking-skeleton.md`
  gets a note that Tasks 11 and 13–16 (presentation, API client, and the
  three feature tests) are amended by this
  design and its plan.

## API versioning

The web app ships in the same process as the API (ADR-0073), so it never
needs versioning. The problem only arises for future non-web clients talking
to self-hosted instances that operators upgrade on their own schedule.
Nothing depends on the API yet: the repository is private until the first
release, and only the latest release is supported pre-1.0
(`governance-licensing-and-release.md`).

This design lays the foundation only.

- **`info.version`:** the spec's `info.version` is the app's release version,
  from the root `package.json`. A client can tell which release a spec
  describes. Bumping the release version changes `openapi.json`, so the
  freshness test prompts a `npm run gen:api` in the same commit.
- **Policy, recorded in ADR-0077:**
  - Before 1.0 the API makes no compatibility promise. Breaking changes are
    allowed, and are called out in the PR description.
  - Additive changes (new routes, new optional fields, new response
    statuses) are preferred over changing or removing existing ones.
  - The versioning scheme is chosen by its own ADR before 1.0.
- **1.0 checklist item, recorded in ADR-0077's consequences** (the same
  convention as ADR-0026): before 1.0, choose the API versioning scheme (URL
  prefix, header or media type, and whether more than one version is served
  at once, weighed against the "latest release only" support policy and the
  Pi-class resource budget), and add breaking-change detection that compares
  `openapi.json` against the base branch (e.g. `oasdiff`, wrapped in a
  `scripts/` entry per ADR-0038).

A later URL prefix stays cheap because of this design. Hand-written API paths
exist only in `routes.ts` and in the `mock()` calls, and the compiler flags
each `mock()` call once the spec changes. The SPA fallback
(`startsWith('/api/')`) and the Vite proxy (`/api`) already accept any
`/api/...` prefix.

## Testing

Each rebuilt branch must pass `npm run lint`, `npm test` and `npm run build`
on its own, not only at the top of the stack. In addition:

- **#6:** the `shared-types` tests on zod 4.
- **#13:**
  - `routes.integration.test.ts` passes unchanged, which shows the API
    behaves the same.
  - New tests: the 400 body shape (`message` + `issues`) is kept; a response
    that does not match its schema returns a 500 and is logged; the spec
    freshness test; `info.version` equals the root `package.json` version.
- **#15:** the client tests, the `mock()` type cases and the types
  freshness test.
- **#16–#18:** the feature tests, with only the mock calls changed.
- **#20:** the Playwright e2e test passes.

## Restack procedure

PR #5 was already rebased onto `main` and retargeted on 2026-09-29
(`91f3a48` → `4b6f145`), because PRs #1, #2 and #4 had been squash-merged.
PR #6 therefore currently shows extra commits until it is restacked.

1. Rebuild each branch in order, from #6 to #20, in its own worktree, on top
   of the rebuilt branch below it: `git rebase --onto <new parent> <old parent>`.
2. Where a PR has changes in this design, add them as one or two new signed
   commits at the top of that branch. Existing commits are not edited, so
   reviewers can see exactly what was added.
3. Run the testing above on every branch. Nothing is pushed until every
   branch passes.
4. Show the owner a table of the branches with their old and new SHAs. Auto
   mode blocks history rewrites, so the owner runs the
   `git push --force-with-lease=<branch>:<old sha>` commands with `!`,
   bottom to top.
5. Add a short "Folded in: OpenAPI contract" note to the descriptions of the
   PRs this design changes (#6, #13, #15–#18).

## Risks

- **zod 4 behaviour changes:** for example, error formatting and `.issues`
  details. The `issues` array in the 400 body may differ in detail from
  zod 3. The web only displays `message`, so this is acceptable. It is
  recorded in the #6 PR description.
- **`fastify-type-provider-zod` 7.x API names** (the validation-error helper
  and the response serialization error) are confirmed against the installed
  package during implementation. The prototype was built on 4.0.2.
- **Conflicts during the restack:** each rebase is mechanical, except where
  the new commits in #13 and #15 are followed by later commits that touch
  `routes.ts`, `app.ts` or `client.ts`. Those conflicts are resolved in the
  later branch, with its tests as the check.
