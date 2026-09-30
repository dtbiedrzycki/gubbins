# OpenAPI Contract (folded into the walking-skeleton stack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a generated OpenAPI document the API contract. Fold each change into the walking-skeleton PR that introduced the code it changes (PRs #6–#20), then hand the restacked branches to the owner to force-push.

**Architecture:**
- Zod schemas in `@gubbins/shared-types` stay the source of truth.
- Fastify routes declare them through `fastify-type-provider-zod`. `@fastify/swagger` turns the routes into `apps/api/openapi.json`, which is committed.
- An isolated package, `packages/api-typegen`, generates `apps/web/src/api/schema.gen.ts` from that file. The web client (`openapi-fetch`) and a typed MSW `mock()` helper both use those generated types.
- Freshness tests in `npm test` fail when either generated file is stale.
- The stack is rebuilt by cherry-picking each branch's original commits onto the rebuilt branch below it, with the new commits added on top. The owner runs the final force-push.

**Tech Stack:**
- Backend: Fastify 5, zod 4, `fastify-type-provider-zod` 7, `@fastify/swagger` 9
- Web: `openapi-fetch` 0.17, `openapi-typescript` 7 (with TypeScript 5, isolated), MSW 3
- Tooling: vitest 5, TypeScript 6, npm workspaces

**Spec:** `docs/superpowers/specs/2026-09-29-openapi-contract-design.md` (branch `docs/walking-skeleton-design`, PR #23). Read it first.

## Global Constraints

- The API does not change: the same paths, methods, status codes and bodies. The only addition is that the spec documents the 400 returned by routes that take a body.
- Statuses per operation, exactly:

  | operationId | Statuses |
  |---|---|
  | `createList` | 201, 400 |
  | `enterGuestKey` | 200, 400, 404 |
  | `getListView` | 200, 404 |
  | `holdItem` | 201, 400, 404, 409 |

- The 400 body is `{ message: 'Invalid request', issues: [{ code, path: string[], message }] }`.
- Nothing serves the spec at runtime: no spec route, no Swagger UI, no `/api/v1` prefix, no version route and no breaking-change CI check.
- The spec's `info.version` is the root `package.json` `version` (currently `0.0.0`). `info.title` is `gubbins`.
- `shared-types` stays body schemas only. Path-parameter schemas live in `routes.ts`.
- The web client does not parse responses with zod at runtime. Feature code keeps its `@gubbins/shared-types` type imports.
- `openapi-fetch` is used only inside `apps/web/src/api/` ("nothing else calls `fetch`").
- No new CI jobs or steps. Freshness is enforced by tests that run in `npm test`.
- Every commit is signed. The repo config signs automatically with SSH; check with `git log --format='%h %G? %s'`, where every line must show `G`.
- Every rebuilt branch passes `npm run lint && npm test && npm run build` on its own.
- Nothing is force-pushed by the executor. The owner runs the final push command (Task 15), because auto mode blocks history rewrites.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn
  ```

## Review Focus

1. **A request body with unknown extra fields** (`{ listTitle, itemTitle, admin: true }`) should still get a 201 with the extra field ignored. zod objects strip unknown keys, and moving validation into Fastify must not change that. Pinned in Task 4.
2. **A POST with no body or invalid JSON** should get the same 400 `{ message: 'Invalid request', … }` shape rather than Fastify's own error format. Pinned in Task 4 (missing body).
3. **Whitespace-only titles** (`'   '`) should still be rejected with a 400. `.trim()` runs before `.min(1)`, and the validator moved. Pinned in Task 4.
4. **Path parameters with reserved characters** (a slug containing a space or `/`) should be percent-encoded into a single segment. The old client didn't encode at all; `openapi-fetch` does. Pinned in Task 9.
5. **A non-JSON error body** (a reverse proxy's HTML 502) should become `ApiError(502, 'Request failed')` instead of crashing on a JSON parse. Pinned in Task 9.

---

## Reference: branches and their pre-restack SHAs

The cherry-pick range for branch N is `<old SHA of N-1>..<old SHA of N>`. The old `01-adrs` SHA (before the #5 rebase) is `91f3a483a57896cabcf0411bd104d287e3ecc6b4`. The new `01-adrs` is `origin/feat/walking-skeleton/01-adrs` (`4b6f145…`).

| PR | Branch (`feat/walking-skeleton/…`) | Old SHA (the lease value in Task 15) |
|---|---|---|
| #5 | `01-adrs` | `4b6f1451a53561181d88e4c63044d2d29abe6e87` (already rebased; unchanged by this plan) |
| #6 | `02-monorepo` | `6513f19257aaa5af4f1d0151f5a24e9f71ef8602` |
| #7 | `03-domain` | `da81fe7a5e7c4e676f102a2f28d6376dd4632459` |
| #8 | `04-ports` | `f42c2412ff5e30a03fdb3b70b481f4f09022c570` |
| #9 | `05-create-and-key` | `fa9dfd0efe0bfa267d9688526e32a84cef57824c` |
| #10 | `06-hold-item` | `9c72169533c92b75e5a7ffa2d475892aafb92c41` |
| #11 | `07-persistence` | `4f44b9ab3a0dc7dcb9dc503d52c89830b84e952d` |
| #12 | `08-crypto-and-observability` | `4536b321bde24320461e44430a41f2781fcfae4a` |
| #13 | `09-presentation` | `d48cca49b6dd2fffb6171a81a8f1c82f5dd8ea07` |
| #14 | `10-web-scaffold` | `97a0296a65d3f19338a64ba82f0f5be92dd5753f` |
| #15 | `11-api-client` | `2dbe10adb857bb6a943373dd5f9530c151d701d4` |
| #16 | `12-create-list-ui` | `47cc7fc4b08378d0a159e63fdac48ff5b40f088e` |
| #17 | `13-guest-key-ui` | `86b437f7d68116d67019b99e25b196fb7bfa0470` |
| #18 | `14-holds-ui` | `022f6b7889adfbd7604df3d5e3067162b8e1b9de` |
| #19 | `15-wire-it-together` | `750fea4f8725be6e0b5f104b8e5b20249e8ae4f0` |
| #20 | `16-e2e-and-verification` | `2265ee23c714dc9db2857f9a873dd1f24bf1a277` |

## Reference: the restack procedure (used by every task that rebuilds a branch)

Work in `/workspace/.worktrees/openapi-restack` (created in Task 1). For branch `NN-name`, with the previous branch `PP-prev`:

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/NN-name restack/PP-prev        # for 02-monorepo, the start point is origin/feat/walking-skeleton/01-adrs
git cherry-pick <old SHA of PP-prev>..<old SHA of NN-name>
```

**Lockfile conflicts.** If a cherry-pick stops on a conflict in `package-lock.json`:

```bash
git checkout --ours package-lock.json     # the rebuilt base's lockfile
# resolve any package.json conflict by hand, keeping both sides' dependency lines
npm install --package-lock-only --ignore-scripts
git add package-lock.json package.json apps/*/package.json packages/*/package.json
git cherry-pick --continue --no-edit
```

**Any other conflict:** stop and report it with `git diff`. Do not guess at a resolution for source files.

**After the branch is complete** (its cherry-picks plus any new commits from the task):

```bash
npm ci
npm run lint && npm test && npm run build
git log --format='%h %G? %s' restack/PP-prev..HEAD      # every line shows G
```

Use `cherry-pick`, not `rebase`. It builds new local branches without rewriting any existing ref, and the old branches stay intact until the owner pushes.

---

### Task 1: Prepare the restack worktree

**Files:** none in the repo. Creates the worktree `/workspace/.worktrees/openapi-restack`.

**Interfaces:**
- Produces: a worktree with every `origin/feat/walking-skeleton/*` ref fetched and matching the SHA table above.

- [ ] **Step 1: Fetch the latest refs and create the worktree**

```bash
cd /workspace && git fetch origin
git worktree add --detach /workspace/.worktrees/openapi-restack origin/feat/walking-skeleton/01-adrs
```

- [ ] **Step 2: Check that no branch has moved since the plan was written**

```bash
cd /workspace/.worktrees/openapi-restack
for pair in 01-adrs:4b6f1451 02-monorepo:6513f192 03-domain:da81fe7a 04-ports:f42c2412 05-create-and-key:fa9dfd0e \
  06-hold-item:9c721695 07-persistence:4f44b9ab 08-crypto-and-observability:4536b321 09-presentation:d48cca49 \
  10-web-scaffold:97a0296a 11-api-client:2dbe10ad 12-create-list-ui:47cc7fc4 13-guest-key-ui:86b437f7 \
  14-holds-ui:022f6b78 15-wire-it-together:750fea4f 16-e2e-and-verification:2265ee23; do
  b=${pair%%:*}; want=${pair##*:}; got=$(git rev-parse origin/feat/walking-skeleton/$b | cut -c1-8)
  [ "$got" = "$want" ] && echo "ok $b" || echo "MOVED $b: $got != $want"
done
```

Expected: 16 lines of `ok`. If any line says `MOVED`, stop and report it. The plan's SHA table and leases would then be wrong.

---

### Task 2: #6 `02-monorepo`: upgrade to zod 4

**Files:**
- Modify: `packages/shared-types/package.json` (the `zod` range)
- Modify: `apps/api/package.json` (the `zod` range)
- Modify: `package-lock.json`
- Test: `packages/shared-types/src/createList.test.ts` and `errorResponse.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: the restack procedure.
- Produces: `restack/02-monorepo`, with every workspace resolving `zod` to 4.x (≥ 4.1.5, as `fastify-type-provider-zod` 7 requires).

- [ ] **Step 1: Rebuild the branch**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/02-monorepo origin/feat/walking-skeleton/01-adrs
git cherry-pick 91f3a483a57896cabcf0411bd104d287e3ecc6b4..6513f19257aaa5af4f1d0151f5a24e9f71ef8602
npm ci
```

Expected: 9 commits are applied, and `npm ci` succeeds.

- [ ] **Step 2: Record the baseline on zod 3**

Run: `npm test --workspace=packages/shared-types`
Expected: PASS. Note how many tests ran.

- [ ] **Step 3: Upgrade zod**

Find every workspace that declares zod at this point in the stack:

```bash
grep -l '"zod"' package.json apps/*/package.json packages/*/package.json
```

For each file listed, change the zod range to `"^4.1.5"`. Then:

```bash
npm install --ignore-scripts
node -p "require('zod/package.json').version"
```

Expected: a 4.x version (4.1.5 or later).

- [ ] **Step 4: Run the tests on zod 4**

Run: `npm run lint && npm test && npm run build`
Expected: PASS, with the same number of `shared-types` tests as Step 2. The schemas in this branch (`z.object`, `z.string().trim().min().max()`, `z.literal(true)`, `z.enum`, `z.array(z.unknown()).optional()`, `z.infer`) are all unchanged in zod 4. If anything fails, report the failure; do not change a schema's meaning to make it pass.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/*/package.json packages/*/package.json package-lock.json
git commit -m "chore(deps): zod 4 for the shared wire schemas

fastify-type-provider-zod 7 (added in the presentation PR, for the OpenAPI
contract) requires zod >= 4.1.5. The schemas here use no API that changed
between zod 3 and 4. Validation error details (the 'issues' array) are
formatted differently in zod 4; nothing reads them beyond display.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
git log --format='%h %G? %s' origin/feat/walking-skeleton/01-adrs..HEAD
```

Expected: 10 commits, all `G`.

---

### Task 3: #7–#12: carry the backend branches forward unchanged

**Files:** none are changed by hand. The branches are rebuilt from their original commits.

**Interfaces:**
- Consumes: `restack/02-monorepo`.
- Produces: `restack/03-domain` … `restack/08-crypto-and-observability`, each passing lint, test and build.

- [ ] **Step 1: Rebuild the six branches in order**

```bash
cd /workspace/.worktrees/openapi-restack
prev=02-monorepo; prevsha=6513f19257aaa5af4f1d0151f5a24e9f71ef8602
for pair in 03-domain:da81fe7a5e7c4e676f102a2f28d6376dd4632459 04-ports:f42c2412ff5e30a03fdb3b70b481f4f09022c570 \
  05-create-and-key:fa9dfd0efe0bfa267d9688526e32a84cef57824c 06-hold-item:9c72169533c92b75e5a7ffa2d475892aafb92c41 \
  07-persistence:4f44b9ab3a0dc7dcb9dc503d52c89830b84e952d 08-crypto-and-observability:4536b321bde24320461e44430a41f2781fcfae4a; do
  b=${pair%%:*}; sha=${pair##*:}
  git switch -c restack/$b restack/$prev && git cherry-pick $prevsha..$sha || { echo "STOPPED at $b"; break; }
  prev=$b; prevsha=$sha
done
```

Expected: no `STOPPED` line. `08-crypto-and-observability` changes the lockfile (kysely and `@fastify/static`). If it conflicts with the zod change, use the lockfile rule in the restack procedure, then re-run the loop from the next branch on.

- [ ] **Step 2: Check every branch**

```bash
for b in 03-domain 04-ports 05-create-and-key 06-hold-item 07-persistence 08-crypto-and-observability; do
  git switch -q restack/$b && npm ci --silent && npm run lint --silent && npm test --silent && npm run build --silent \
    && echo "PASS $b" || { echo "FAIL $b"; break; }
done
git log --format='%G?' origin/feat/walking-skeleton/01-adrs..restack/08-crypto-and-observability | sort | uniq -c
```

Expected: 6 `PASS` lines, and only `G` in the signature count.

---

### Task 4: #13 `09-presentation`: routes declare their schemas, and the error handler keeps the 400 shape

**Files:**
- Modify: `apps/api/package.json` (add `fastify-type-provider-zod` ^7.0.0 and `@fastify/swagger` ^9.9.0)
- Modify: `apps/api/src/presentation/app.ts`
- Modify: `apps/api/src/presentation/routes.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `restack/08-crypto-and-observability`.
- Produces: `buildApp(deps, options): FastifyInstance`, still synchronous and with the same signature. The routes carry `operationId`s `createList`, `enterGuestKey`, `getListView` and `holdItem`. `@fastify/swagger` is registered, so `app.swagger()` works after `await app.ready()`. Task 5 relies on this.

- [ ] **Step 1: Rebuild the branch and install the dependencies**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/09-presentation restack/08-crypto-and-observability
git cherry-pick 4536b321bde24320461e44430a41f2781fcfae4a..d48cca49b6dd2fffb6171a81a8f1c82f5dd8ea07
npm ci
npm install --workspace=apps/api fastify-type-provider-zod@^7.0.0 @fastify/swagger@^9.9.0
npm test --workspace=apps/api
```

Expected: the cherry-picks apply and the existing API tests pass.

- [ ] **Step 2: Write the failing tests**

Add these to `apps/api/src/presentation/routes.integration.test.ts`. Put the first four inside the existing `describe('POST /api/lists', …)` block:

```ts
  it('keeps the 400 body shape: message plus zod-style issues', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: '', itemTitle: 'Stroller' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Invalid request',
      issues: [{ code: 'too_small', path: ['listTitle'], message: expect.any(String) }],
    });
  });

  it('rejects a whitespace-only listTitle (trim runs before min)', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: '   ', itemTitle: 'Stroller' } });
    expect(response.statusCode).toBe(400);
  });

  it('returns the same 400 shape when the body is missing', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'Invalid request' });
  });

  it('ignores unknown extra fields in the body', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller', admin: true } });
    expect(response.statusCode).toBe(201);
  });
```

Add this new `describe` block at the end of the file, and add `Logger` to the imports (`import type { Logger } from '../application/ports/Logger.js';`):

```ts
describe('response validation', () => {
  it('logs and returns a generic 500 when a handler produces a body that does not match its response schema', async () => {
    const db = createDb(':memory:');
    await migrateToLatest(db);
    const errors: string[] = [];
    const logger: Logger = { logInfo: () => {}, logWarn: () => {}, logError: (message) => { errors.push(message); } };
    const deps = buildDependencies(db, logger);
    const brokenCreateList = { execute: async () => ({ slug: 42 }) };
    const brokenApp = buildApp({ ...deps, createList: brokenCreateList as unknown as typeof deps.createList }, { cookieSecret: 'test-secret' });
    disposeWithApp(brokenApp, db);
    onTestFinished(() => brokenApp.close());

    const response = await brokenApp.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: 'Internal server error' });
    expect(errors).toContain('response_schema_mismatch');
  });
});
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `npm test --workspace=apps/api -- routes.integration`
Expected: FAIL.
- The 400 shape test fails, because today's `issues` are raw zod issues with extra keys.
- The response-validation test fails, because `errors` doesn't contain `'response_schema_mismatch'`.

The whitespace, missing-body and extra-fields tests may already pass. They pin existing behaviour across the change.

- [ ] **Step 4: Rewrite `app.ts`**

Replace the imports and `buildApp` in `apps/api/src/presentation/app.ts` with the following. It keeps `BuildAppOptions` and the static-serving block exactly as they are.

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import path from 'node:path';
import { ZodError } from 'zod';
import {
  hasZodFastifySchemaValidationErrors, isResponseSerializationError,
  jsonSchemaTransform, serializerCompiler, validatorCompiler,
} from 'fastify-type-provider-zod';
import { errorResponseSchema } from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import { registerRoutes } from './routes.js';
import { appVersion } from './appVersion.js';

export interface BuildAppOptions {
  cookieSecret: string;
  /** Directory to serve as static files (the built apps/web bundle). Omit to skip static serving — used by Task 11's own integration tests, which only exercise /api routes. */
  webDist?: string;
}

export function buildApp(deps: AppDependencies, options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cookie, { secret: options.cookieSecret });
  // The OpenAPI document (apps/api/openapi.json, ADR-0077) is generated from
  // the route schemas. Swagger collects routes through an onRoute hook, so it
  // must be registered before them — the routes go in a plugin queued after it,
  // which keeps buildApp synchronous.
  app.register(swagger, {
    openapi: { info: { title: 'gubbins', version: appVersion } },
    transform: jsonSchemaTransform,
  });
  app.register(async (instance) => registerRoutes(instance, deps));

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

  app.setErrorHandler<Error>((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      // The provider does not expose zod's issue objects; rebuild the same
      // { code, path, message } shape the pre-OpenAPI handler returned.
      const issues = error.validation.map((v) => ({ code: v.keyword, path: v.instancePath.split('/').slice(1), message: v.message }));
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request', issues }));
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request', issues: error.issues }));
      return;
    }
    // A handler built a body its own response schema rejects: a server bug,
    // never the client's fault.
    const event = isResponseSerializationError(error) ? 'response_schema_mismatch' : 'unhandled_error';
    // Fastify's own `logger: false` above means nothing else in this process
    // logs unhandled errors — without this, a real failure (e.g. a
    // constraint violation, a bad migration) would produce a 500 with no
    // trace anywhere, stdout included.
    deps.logger.logError(event, { message: error.message, stack: error.stack, url: request.url });
    reply.code(500).send(errorResponseSchema.parse({ message: 'Internal server error' }));
  });

  return app;
}
```

Create `apps/api/src/presentation/appVersion.ts`:

```ts
import { readFileSync } from 'node:fs';

// The release version, from the root package.json. It is the OpenAPI
// document's info.version, so a client can tell which release a spec
// describes. The path resolves from both src/presentation (tsx) and
// dist/presentation (compiled), which sit at the same depth.
export const appVersion: string = (
  JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
```

- [ ] **Step 5: Rewrite `routes.ts`**

Replace `apps/api/src/presentation/routes.ts` with the following. Handler logic is unchanged; only validation and typing move into `schema`.

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createListRequestSchema, createListResponseSchema,
  enterGuestKeyRequestSchema, enterGuestKeyResponseSchema,
  holdItemRequestSchema, holdItemResponseSchema, listViewResponseSchema,
  errorResponseSchema,
} from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import {
  WishlistNotFoundError, InvalidGuestKeyError, ItemNotFoundError, ItemAlreadyHeldError, ConcurrencyError,
} from '../domain/errors.js';
import type { Wishlist } from '../domain/entities/Wishlist.js';

const SESSION_COOKIE = 'gubbins_session';

// Path parameters are an HTTP concern, so their schemas live here rather than
// in @gubbins/shared-types (which holds request/response bodies only).
const slugParams = z.object({ slug: z.string() });
const slugItemParams = z.object({ slug: z.string(), itemId: z.string() });

const NOT_FOUND = { message: 'Not found' } as const;

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
    if (payload.wishlistId !== wishlist.id.value || payload.keyGen !== wishlist.keyGen) return null;
    return payload;
  } catch {
    return null;
  }
}

export function registerRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post('/api/lists', {
    schema: {
      operationId: 'createList',
      body: createListRequestSchema,
      response: { 201: createListResponseSchema, 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const result = await deps.createList.execute(request.body);
    return reply.code(201).send(result);
  });

  app.post('/api/lists/:slug/session', {
    schema: {
      operationId: 'enterGuestKey',
      params: slugParams,
      body: enterGuestKeyRequestSchema,
      response: { 200: enterGuestKeyResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    try {
      const result = await deps.enterGuestKey.execute({ slug, key: request.body.key });
      const payload: SessionPayload = { wishlistId: result.wishlistId, keyGen: result.keyGen, sessionId: result.sessionId };
      reply.setCookie(SESSION_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict' });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      // Same generic response for "no such list" and "wrong key" —
      // access-identity.md / ADR-016 / ADR-054 forbid distinguishing them.
      if (err instanceof WishlistNotFoundError || err instanceof InvalidGuestKeyError) {
        return reply.code(404).send(NOT_FOUND);
      }
      throw err;
    }
  });

  app.get('/api/lists/:slug', {
    schema: {
      operationId: 'getListView',
      params: slugParams,
      response: { 200: listViewResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const wishlist = await deps.wishlists.findBySlug(request.params.slug);
    if (!wishlist) return reply.code(404).send(NOT_FOUND);
    const session = readSession(request, wishlist);
    // Same generic 404 as an unknown slug — ADR-016/054: a caller must not be
    // able to tell "no such list" apart from "list exists, you're just not in
    // it" by status code alone (that would let an unauthenticated prober
    // enumerate valid slugs).
    if (!session) return reply.code(404).send(NOT_FOUND);

    // Read through the aggregate: findBySlug already loaded the item and its
    // availability status, so there is no second repository round-trip and no
    // way to render an item that isn't this wishlist's. Shaping the response
    // is presentation's job — the domain no longer owns a view of itself.
    const item = wishlist.item;
    if (!item) return reply.code(404).send(NOT_FOUND);

    return reply.code(200).send({
      title: wishlist.title,
      item: { id: item.id.value, title: item.title, status: item.status },
    });
  });

  app.post('/api/lists/:slug/items/:itemId/hold', {
    schema: {
      operationId: 'holdItem',
      params: slugItemParams,
      body: holdItemRequestSchema,
      response: { 201: holdItemResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (request, reply) => {
    const { slug, itemId } = request.params;
    const wishlist = await deps.wishlists.findBySlug(slug);
    if (!wishlist) return reply.code(404).send(NOT_FOUND);
    const session = readSession(request, wishlist);
    // Same generic 404 as an unknown slug — see the GET route above.
    if (!session) return reply.code(404).send(NOT_FOUND);

    // `wishlist` was loaded scoped to this URL's slug, so `wishlist.item` can
    // only ever be *this* wishlist's item or null. There is no query parameter
    // that could make it yield another list's item, which is what makes the
    // cross-wishlist bug class structurally unreachable here rather than
    // merely patched.
    if (wishlist.item?.id.value !== itemId) return reply.code(404).send(NOT_FOUND);

    try {
      const result = await deps.holdItem.execute({
        wishlistId: wishlist.id.value, itemId, sessionId: session.sessionId, idempotencyKey: request.body.idempotencyKey,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof ItemNotFoundError) return reply.code(404).send(NOT_FOUND);
      if (err instanceof ItemAlreadyHeldError || err instanceof ConcurrencyError) {
        return reply.code(409).send({ message: 'Item already held' });
      }
      throw err;
    }
  });
}
```

Before replacing the file, compare it with the cherry-picked `routes.ts` (`git show HEAD:apps/api/src/presentation/routes.ts`). If any handler there differs from the logic above (a comment, an extra check, a different error mapping), keep the cherry-picked logic and change only the schema and typing parts.

- [ ] **Step 6: Run all the API tests**

Run: `npm test --workspace=apps/api && npm run lint --workspace=apps/api && npm run build --workspace=apps/api`
Expected: PASS, including every existing test in `routes.integration.test.ts`. That shows the API behaves as before.

- [ ] **Step 7: Commit**

```bash
git add apps/api package-lock.json
git commit -m "feat(api): route schemas validated and typed through fastify-type-provider-zod

Routes declare body/params/response zod schemas with an operationId; Fastify
validates requests and serializes responses against them, replacing the
hand-written casts and .parse() calls. The 400 body keeps its
{ message, issues: [{ code, path, message }] } shape; a response that fails
its own schema is logged as response_schema_mismatch and returns a generic
500. @fastify/swagger is registered ahead of the routes so the OpenAPI
document can be generated from them (next commit).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

---

### Task 5: #13 `09-presentation`: the committed OpenAPI document and its freshness test

**Files:**
- Create: `apps/api/src/presentation/openApiDocument.ts`
- Create: `apps/api/src/presentation/openApiDocument.test.ts`
- Create: `apps/api/scripts/emit-openapi.ts`
- Create: `apps/api/openapi.json` (generated)
- Modify: `apps/api/package.json` (the `gen:openapi` script)
- Modify: `package.json` (root; the `gen:api` script)

**Interfaces:**
- Consumes: `buildApp` with swagger registered (Task 4), and `appVersion` (Task 4).
- Produces:
  - `generateOpenApiDocument(): Promise<string>` returns the pretty-printed spec plus a trailing newline.
  - `apps/api/openapi.json`, which Task 8 reads.
  - The root script `gen:api`. At this point it only generates the spec; Task 8 extends it to the web types.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/presentation/openApiDocument.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument } from './openApiDocument.js';

const committedPath = new URL('../../openapi.json', import.meta.url);
const rootPackage = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string };

describe('the OpenAPI document (ADR-0077)', () => {
  it('matches the committed apps/api/openapi.json', async () => {
    const generated = await generateOpenApiDocument();
    const committed = readFileSync(committedPath, 'utf8');
    expect(generated, 'apps/api/openapi.json is stale — run `npm run gen:api`').toBe(committed);
  });

  it('carries the release version and title', async () => {
    const doc = JSON.parse(await generateOpenApiDocument());
    expect(doc.info).toEqual({ title: 'gubbins', version: rootPackage.version });
  });

  it('documents exactly the statuses each operation returns', async () => {
    const doc = JSON.parse(await generateOpenApiDocument());
    const statuses: Record<string, string[]> = {};
    for (const methods of Object.values(doc.paths) as Record<string, { operationId: string; responses: object }>[]) {
      for (const op of Object.values(methods)) statuses[op.operationId] = Object.keys(op.responses).sort();
    }
    expect(statuses).toEqual({
      createList: ['201', '400'],
      enterGuestKey: ['200', '400', '404'],
      getListView: ['200', '404'],
      holdItem: ['201', '400', '404', '409'],
    });
  });
});
```

- [ ] **Step 2: Run the test to check it fails**

Run: `npm test --workspace=apps/api -- openApiDocument`
Expected: FAIL with "Cannot find module './openApiDocument.js'" (or its vitest equivalent).

- [ ] **Step 3: Implement the generator and the script**

Create `apps/api/src/presentation/openApiDocument.ts`:

```ts
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';

/**
 * The API contract (ADR-0077): the OpenAPI document @fastify/swagger derives
 * from the route schemas, pretty-printed with a trailing newline so the
 * committed file diffs cleanly. Builds the app against a throwaway in-memory
 * database and never listens on a port.
 */
export async function generateOpenApiDocument(): Promise<string> {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  const app = buildApp(buildDependencies(db), { cookieSecret: 'openapi-generation-only' });
  disposeWithApp(app, db);
  try {
    await app.ready();
    return JSON.stringify(app.swagger(), null, 2) + '\n';
  } finally {
    await app.close();
  }
}
```

Create `apps/api/scripts/emit-openapi.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { generateOpenApiDocument } from '../src/presentation/openApiDocument.js';

const target = new URL('../openapi.json', import.meta.url);
writeFileSync(target, await generateOpenApiDocument());
console.log(`wrote ${target.pathname}`);
```

In `apps/api/package.json` `scripts`, add:

```json
"gen:openapi": "tsx scripts/emit-openapi.ts"
```

In the root `package.json` `scripts`, add:

```json
"gen:api": "npm run build --workspace=packages/shared-types && npm run gen:openapi --workspace=apps/api"
```

- [ ] **Step 4: Generate the document and run the tests**

```bash
npm run gen:api
node -e "const d=require('./apps/api/openapi.json');console.log(d.openapi, d.info, Object.keys(d.paths))"
npm test --workspace=apps/api -- openApiDocument
```

Expected:
- `3.0.3 { title: 'gubbins', version: '0.0.0' }`, followed by the four paths in `{param}` form.
- All 3 tests PASS.

- [ ] **Step 5: Check that the freshness test catches drift**

```bash
sed -i 's/"gubbins"/"gubbins-stale"/' apps/api/openapi.json
npm test --workspace=apps/api -- openApiDocument   # expect FAIL, with the "run `npm run gen:api`" message
git checkout apps/api/openapi.json
```

- [ ] **Step 6: Run the full checks and commit**

```bash
npm run lint && npm test && npm run build
git add apps/api package.json
git commit -m "feat(api): commit the generated OpenAPI document, with a freshness test

apps/api/openapi.json is generated from the route schemas by
\`npm run gen:api\` and committed, so other clients can generate from the
repo. A test regenerates it in memory and fails when the committed file is
stale; it also pins info.version to the release version and each
operation's documented statuses.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

---

### Task 6: #13 `09-presentation`: ADR-0077 and the front-end architecture note

**Files:**
- Create: `docs/adr/0077-openapi-document-generated-from-route-schemas-is-the-api-contract.md`
- Modify: `docs/adr/README.md` (add an index row after the 076 row)
- Modify: `docs/spec/frontend-architecture.md` (line 8)

**Interfaces:**
- Consumes: the ADR format of `docs/adr/0071-fastify-as-the-backend-http-framework.md`. Read it first.
- Produces: ADR-0077, which the code comments in Tasks 4, 5 and 8 cite.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0077-openapi-document-generated-from-route-schemas-is-the-api-contract.md`:

```markdown
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
```

- [ ] **Step 2: Update the ADR index and the front-end spec**

In `docs/adr/README.md`, after the `| [076](…) |` row, add:

```markdown
| [077](0077-openapi-document-generated-from-route-schemas-is-the-api-contract.md) | The OpenAPI document generated from route schemas is the API contract | Accepted |
```

In `docs/spec/frontend-architecture.md`, replace:

```markdown
- **Shared types package** generated from zod schemas, so backend renames break the front-end build
```

with:

```markdown
- **API types generated from the OpenAPI document** (`apps/api/openapi.json`, itself generated from the zod route schemas — ADR-[077](../adr/0077-openapi-document-generated-from-route-schemas-is-the-api-contract.md)), so backend renames break the front-end build
```

- [ ] **Step 3: Check the links, then commit**

```bash
python3 scripts/check_adr_links.py
git add docs
git commit -m "docs(adr): ADR-0077 — the generated OpenAPI document is the API contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
npm run lint && npm test && npm run build
git log --format='%h %G? %s' restack/08-crypto-and-observability..HEAD
```

Expected: the link check passes, the full checks pass, and all of #13's commits (10 cherry-picked plus 3 new) show `G`.

---

### Task 7: #14 `10-web-scaffold`: carry forward unchanged

**Files:** none are changed by hand.

**Interfaces:**
- Consumes: `restack/09-presentation`.
- Produces: `restack/10-web-scaffold`.

- [ ] **Step 1: Rebuild and check**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/10-web-scaffold restack/09-presentation
git cherry-pick d48cca49b6dd2fffb6171a81a8f1c82f5dd8ea07..97a0296a65d3f19338a64ba82f0f5be92dd5753f
npm ci && npm run lint && npm test && npm run build
```

Expected: PASS. This branch changes the lockfile (the web toolchain). On a conflict, use the lockfile rule in the restack procedure.

---

### Task 8: #15 `11-api-client`: the isolated type generator, the generated types, and their freshness test

**Files:**
- Create: `packages/api-typegen/package.json`
- Create: `packages/api-typegen/index.js`
- Create: `packages/api-typegen/index.d.ts`
- Create: `packages/api-typegen/bin/gen.js`
- Create: `apps/web/src/api/schema.gen.ts` (generated)
- Create: `apps/web/src/api/schema.gen.test.ts`
- Modify: `apps/web/package.json` (add the `gen:api-types` script and the `@gubbins/api-typegen` dev dependency)
- Modify: `apps/web/eslint.config.js` (ignore the generated file)
- Modify: `package.json` (root; extend `gen:api`)
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `apps/api/openapi.json` (Task 5).
- Produces:
  - `generateApiTypes(specJson: string): Promise<string>`, exported by `@gubbins/api-typegen`.
  - `apps/web/src/api/schema.gen.ts`, which exports `paths`, `operations` and `components` (the `openapi-typescript` 7 shape). Task 9 uses `paths`.

- [ ] **Step 1: Rebuild the branch**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/11-api-client restack/10-web-scaffold
git cherry-pick 97a0296a65d3f19338a64ba82f0f5be92dd5753f..2dbe10adb857bb6a943373dd5f9530c151d701d4
npm ci
```

- [ ] **Step 2: Create the generator package**

Create `packages/api-typegen/package.json`:

```json
{
  "name": "@gubbins/api-typegen",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Generates apps/web's API types from apps/api/openapi.json (ADR-0077). Isolated so openapi-typescript can use the TypeScript 5 it requires as a peer while the rest of the repo is on TypeScript 6; delete once openapi-typescript supports 6.",
  "exports": { ".": { "types": "./index.d.ts", "default": "./index.js" } },
  "bin": { "api-typegen": "./bin/gen.js" },
  "devDependencies": {
    "openapi-typescript": "^7.13.0",
    "typescript": "^5.9.3"
  }
}
```

Create `packages/api-typegen/index.js`:

```js
import openapiTS, { astToString } from 'openapi-typescript';

export const HEADER = '// Generated from apps/api/openapi.json by `npm run gen:api` (ADR-0077). Do not edit.\n\n';

/** Returns the TypeScript source for the given OpenAPI document's JSON text. */
export async function generateApiTypes(specJson) {
  return HEADER + astToString(await openapiTS(specJson));
}
```

Create `packages/api-typegen/index.d.ts`:

```ts
export declare const HEADER: string;
/** Returns the TypeScript source for the given OpenAPI document's JSON text. */
export declare function generateApiTypes(specJson: string): Promise<string>;
```

Create `packages/api-typegen/bin/gen.js`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { generateApiTypes } from '../index.js';

const [spec, out] = process.argv.slice(2);
if (!spec || !out) {
  console.error('usage: api-typegen <openapi.json> <out.ts>');
  process.exit(2);
}
writeFileSync(out, await generateApiTypes(readFileSync(spec, 'utf8')));
console.log(`wrote ${out}`);
```

Then:

```bash
chmod +x packages/api-typegen/bin/gen.js
npm install --workspace=apps/web --save-dev @gubbins/api-typegen@*
node -e "const l=require('./package-lock.json').packages;for(const k of Object.keys(l))if(/node_modules\/(typescript|openapi-typescript)$/.test(k))console.log(k,l[k].version)"
```

Expected: the root `node_modules/typescript` is 6.x, and there are nested `packages/api-typegen/node_modules/typescript` (5.x) and `packages/api-typegen/node_modules/openapi-typescript` (7.x) entries. If npm reports `ERESOLVE`, stop and report it. Do not use `--legacy-peer-deps`.

- [ ] **Step 3: Write the failing freshness test**

Create `apps/web/src/api/schema.gen.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateApiTypes } from '@gubbins/api-typegen';

describe('apps/web/src/api/schema.gen.ts (ADR-0077)', () => {
  it('matches the types generated from the committed apps/api/openapi.json', async () => {
    const spec = readFileSync(new URL('../../../api/openapi.json', import.meta.url), 'utf8');
    const committed = readFileSync(new URL('./schema.gen.ts', import.meta.url), 'utf8');
    expect(await generateApiTypes(spec), 'schema.gen.ts is stale — run `npm run gen:api`').toBe(committed);
  });
});
```

Run: `npm test --workspace=apps/web -- schema.gen`
Expected: FAIL with ENOENT for `schema.gen.ts`.

- [ ] **Step 4: Add the scripts, then generate**

In `apps/web/package.json` `scripts`, add:

```json
"gen:api-types": "node ../../packages/api-typegen/bin/gen.js ../api/openapi.json src/api/schema.gen.ts"
```

In the root `package.json`, change `gen:api` to:

```json
"gen:api": "npm run build --workspace=packages/shared-types && npm run gen:openapi --workspace=apps/api && npm run gen:api-types --workspace=apps/web"
```

In `apps/web/eslint.config.js`, add this as the first element of the exported array:

```js
  { ignores: ['src/api/schema.gen.ts'] },
```

Then:

```bash
npm run gen:api
grep -n '"/api/lists/{slug}/items/{itemId}/hold"' apps/web/src/api/schema.gen.ts
npm test --workspace=apps/web -- schema.gen
```

Expected: the grep finds the path, and the test PASSES.

- [ ] **Step 5: Check that the test catches drift, then commit**

```bash
echo '// drift' >> apps/web/src/api/schema.gen.ts
npm test --workspace=apps/web -- schema.gen     # expect FAIL, with the "run `npm run gen:api`" message
git checkout apps/web/src/api/schema.gen.ts
npm run lint && npm test && npm run build
git add packages/api-typegen apps/web package.json package-lock.json
git commit -m "feat(web): generate API types from the OpenAPI document

packages/api-typegen wraps openapi-typescript in its own workspace so it
can use the TypeScript 5 it requires as a peer while the repo stays on
TypeScript 6. \`npm run gen:api\` now regenerates both apps/api/openapi.json
and apps/web/src/api/schema.gen.ts; a test fails when the committed types
are stale.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

---

### Task 9: #15 `11-api-client`: the `openapi-fetch` client and the typed `mock()` helper

**Files:**
- Modify: `apps/web/src/api/client.ts` (rewritten)
- Modify: `apps/web/src/api/client.test.ts`
- Create: `apps/web/src/test/msw/mock.ts`
- Create: `apps/web/src/test/msw/mock.test.ts`
- Modify: `apps/web/package.json` (add the `openapi-fetch` dependency)
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `paths` from `apps/web/src/api/schema.gen.ts` (Task 8).
- Produces, unchanged:
  - `api.createList(input: CreateListRequest): Promise<CreateListResponse>`
  - `api.enterGuestKey(slug: string, input: EnterGuestKeyRequest): Promise<EnterGuestKeyResponse>`
  - `api.getListView(slug: string): Promise<ListViewResponse>`
  - `api.holdItem(slug: string, itemId: string, input: HoldItemRequest): Promise<HoldItemResponse>`
  - `class ApiError extends Error { status: number }`
- Produces, new: `mock(method: 'get' | 'post', path: keyof paths, status, body)`, which returns an MSW `HttpHandler`. Tasks 10–12 use it.

- [ ] **Step 1: Install `openapi-fetch`**

```bash
npm install --workspace=apps/web openapi-fetch@^0.17.0
```

- [ ] **Step 2: Write the failing tests**

Replace `apps/web/src/api/client.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { mock } from '../test/msw/mock';
import { api, ApiError } from './client';

describe('api.createList', () => {
  it('returns the response body on success', async () => {
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' }));

    const result = await api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    expect(result).toEqual({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' });
  });

  it('throws ApiError carrying the status and the server message for a documented error', async () => {
    server.use(mock('post', '/api/lists', 400, { message: 'Invalid request' }));

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' }))
      .rejects.toMatchObject({ status: 400, message: 'Invalid request' });
  });

  // Deliberately outside the contract: raw MSW, because no route documents a 500.
  it('throws ApiError for an undocumented status', async () => {
    server.use(http.post('/api/lists', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })));

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' })).rejects.toThrow(ApiError);
  });

  it('falls back to a generic message when the error body is not JSON (e.g. a proxy page)', async () => {
    server.use(http.post('/api/lists', () => new HttpResponse('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })));

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' }))
      .rejects.toMatchObject({ status: 502, message: 'Request failed' });
  });
});

describe('path parameters', () => {
  it('percent-encodes a slug so it stays a single path segment', async () => {
    let requested = '';
    server.use(http.get('/api/lists/:slug', ({ request }) => {
      requested = new URL(request.url).pathname;
      return HttpResponse.json({ title: 't', item: { id: 'i', title: 'x', status: 'available' } });
    }));

    await api.getListView('a b/c');

    expect(requested).toBe('/api/lists/a%20b%2Fc');
  });

  it('sends slug and itemId to the hold route', async () => {
    let requested = '';
    server.use(http.post('/api/lists/:slug/items/:itemId/hold', ({ request }) => {
      requested = new URL(request.url).pathname;
      return HttpResponse.json({ holdId: 'h', itemId: 'item-1', expiresAt: '2026-01-04T00:00:00.000Z' }, { status: 201 });
    }));

    await api.holdItem('abc123', 'item-1', { idempotencyKey: 'k' });

    expect(requested).toBe('/api/lists/abc123/items/item-1/hold');
  });
});
```

Create `apps/web/src/test/msw/mock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { server } from './server';
import { mock } from './mock';

describe('mock()', () => {
  it('serves the given status and body at the contract path, matching any parameter value', async () => {
    server.use(mock('post', '/api/lists/{slug}/items/{itemId}/hold', 409, { message: 'Item already held' }));

    const response = await fetch(`${location.origin}/api/lists/any-slug/items/any-item/hold`, { method: 'POST' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'Item already held' });
  });

  it('is checked against the OpenAPI contract at compile time', () => {
    // Each line below must fail to compile. `npm run build` (tsc --noEmit)
    // fails if any of them stops failing, via "Unused '@ts-expect-error'".
    // @ts-expect-error — the path is not in the spec
    mock('post', '/api/lists/{slug}/holds', 201, {});
    // @ts-expect-error — 418 is not a documented status for this operation
    mock('post', '/api/lists/{slug}/items/{itemId}/hold', 418, { message: 'x' });
    // @ts-expect-error — the body does not match the 201 schema
    mock('post', '/api/lists/{slug}/items/{itemId}/hold', 201, { message: 'x' });
    // @ts-expect-error — the route has no GET
    mock('get', '/api/lists', 201, { slug: 's', ownerToken: 'o', key: 'k', itemId: 'i' });
    expect(true).toBe(true);
  });
});
```

Run: `npm test --workspace=apps/web -- client mock`
Expected: FAIL, because `mock` does not exist yet.

- [ ] **Step 3: Implement `mock()`**

Create `apps/web/src/test/msw/mock.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { paths } from '../../api/schema.gen';

type Method = 'get' | 'post';
type Operation<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>;
type Status<P extends keyof paths, M extends Method> =
  Operation<P, M> extends { responses: infer R } ? keyof R & number : never;
type Body<P extends keyof paths, M extends Method, S> =
  Operation<P, M> extends { responses: infer R }
    ? S extends keyof R ? R[S] extends { content: { 'application/json': infer B } } ? B : never : never
    : never;

/**
 * An MSW handler typed by the OpenAPI contract (ADR-0077): the path must be in
 * apps/api/openapi.json, the status must be one that operation documents, and
 * the body must match that status's schema. `{param}` placeholders become
 * MSW's `:param`, so the mock matches any parameter value.
 *
 * S is inferred from `status` alone (`const S extends number`, constrained at
 * the parameter) and `body` is NoInfer — otherwise TypeScript widens S to
 * every documented status and accepts any status's body.
 */
export function mock<P extends keyof paths, M extends Method, const S extends number>(
  method: M, path: P, status: S & Status<P, M>, body: NoInfer<Body<P, M, S>>,
): HttpHandler {
  const mswPath = path.replace(/\{(\w+)\}/g, ':$1');
  return http[method](mswPath, () => HttpResponse.json(body as object, { status }));
}
```

- [ ] **Step 4: Rewrite the client**

Replace `apps/web/src/api/client.ts` with:

```ts
import createClient from 'openapi-fetch';
import type {
  CreateListRequest, CreateListResponse, EnterGuestKeyRequest, EnterGuestKeyResponse,
  HoldItemRequest, HoldItemResponse, ListViewResponse,
} from '@gubbins/shared-types';
import type { paths } from './schema.gen';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Paths, methods, params and bodies are typed by the OpenAPI contract
// (apps/api/openapi.json → schema.gen.ts, ADR-0077). The server validates
// every response against its schema before sending, so the client does not
// re-validate. The base URL is absolute because openapi-fetch builds a
// Request before calling fetch, and Request rejects relative URLs outside a
// browser document (e.g. under vitest).
const http = createClient<paths>({ baseUrl: globalThis.location.origin, credentials: 'same-origin' });

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>({ data, error, response }: FetchResult<T>): T {
  if (!response.ok || data === undefined) {
    // openapi-fetch parses an error body as JSON when it can and leaves it as
    // text otherwise (e.g. a reverse proxy's HTML error page).
    const message = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Request failed';
    throw new ApiError(response.status, message);
  }
  return data;
}

export const api = {
  createList: (input: CreateListRequest): Promise<CreateListResponse> =>
    http.POST('/api/lists', { body: input }).then(unwrap),

  enterGuestKey: (slug: string, input: EnterGuestKeyRequest): Promise<EnterGuestKeyResponse> =>
    http.POST('/api/lists/{slug}/session', { params: { path: { slug } }, body: input }).then(unwrap),

  getListView: (slug: string): Promise<ListViewResponse> =>
    http.GET('/api/lists/{slug}', { params: { path: { slug } } }).then(unwrap),

  holdItem: (slug: string, itemId: string, input: HoldItemRequest): Promise<HoldItemResponse> =>
    http.POST('/api/lists/{slug}/items/{itemId}/hold', { params: { path: { slug, itemId } }, body: input }).then(unwrap),
};
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test --workspace=apps/web && npm run build --workspace=apps/web && npm run lint --workspace=apps/web`
Expected: PASS. The build runs `tsc --noEmit`, which checks the four `@ts-expect-error` lines.
- **If only the `mock('get', '/api/lists', …)` line reports "Unused '@ts-expect-error'":** that case (a method the path doesn't have) was not covered by the prototype. Delete that line and report it; do not loosen `mock()`'s types.
- **If `tsc` reports that `.then(unwrap)` can't infer `T`:** change each call to `.then((r) => unwrap(r))`. If that still fails, add the explicit type argument, e.g. `unwrap<CreateListResponse>`.
- **If a test fails with "Failed to parse URL":** `globalThis.location` isn't set in that environment. Report it rather than hard-coding an origin.

- [ ] **Step 6: Commit**

```bash
npm run lint && npm test && npm run build
git add apps/web package-lock.json
git commit -m "feat(web): openapi-fetch client and a contract-typed MSW mock() helper

The client's paths, params and bodies are typed by the generated OpenAPI
types; its public api.* signatures are unchanged. Responses are no longer
re-parsed with zod on the client — the server validates them before
sending. mock() types test handlers by the same contract: an undocumented
path, status, or body shape is a compile error.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
git log --format='%h %G? %s' restack/10-web-scaffold..HEAD
```

Expected: 3 commits (1 cherry-picked plus 2 new), all `G`.

---

### Task 10: #16 `12-create-list-ui`: move the create-list tests to `mock()`

**Files:**
- Modify: `apps/web/src/features/create-list/CreateListForm.test.tsx`
- Modify: `apps/web/src/features/create-list/useCreateList.test.tsx`

**Interfaces:**
- Consumes: `mock` from `apps/web/src/test/msw/mock.ts` (Task 9).

- [ ] **Step 1: Rebuild the branch**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/12-create-list-ui restack/11-api-client
git cherry-pick 2dbe10adb857bb6a943373dd5f9530c151d701d4..47cc7fc4b08378d0a159e63fdac48ff5b40f088e
npm test --workspace=apps/web
```

Expected: PASS. The old hand-written handlers still work against the new client.

- [ ] **Step 2: Convert the handlers**

In `CreateListForm.test.tsx`:
- Change the import `import { http, HttpResponse } from 'msw';` to `import { mock } from '../../test/msw/mock';`.
- Replace each of the three handlers:

```tsx
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'owner-secret-token', key: 'guest-key-value', itemId: 'item-1' }));
```

(once for each of the two 201 cases), and

```tsx
    server.use(mock('post', '/api/lists', 400, { message: 'Invalid request' }));
```

In `useCreateList.test.tsx`, make the same import change and replace the handler with:

```tsx
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'tok', key: 'key', itemId: 'item-1' }));
```

Leave every assertion unchanged.

- [ ] **Step 3: Run the tests and commit**

```bash
grep -rn "from 'msw'" apps/web/src/features/create-list || echo "no raw msw left"
npm run lint && npm test && npm run build
git add apps/web/src/features/create-list
git commit -m "test(web): create-list tests mock through the OpenAPI contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

Expected: `no raw msw left`, and PASS.

---

### Task 11: #17 `13-guest-key-ui`: move the guest-key tests to `mock()`

**Files:**
- Modify: `apps/web/src/features/guest-key/GuestKeyGate.test.tsx`

**Interfaces:**
- Consumes: `mock` (Task 9).

- [ ] **Step 1: Rebuild the branch**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/13-guest-key-ui restack/12-create-list-ui
git cherry-pick 47cc7fc4b08378d0a159e63fdac48ff5b40f088e..86b437f7d68116d67019b99e25b196fb7bfa0470
npm test --workspace=apps/web
```

- [ ] **Step 2: Convert the handlers**

In `GuestKeyGate.test.tsx`, change the import `import { http, HttpResponse } from 'msw';` to `import { mock } from '../../test/msw/mock';`, then replace:

```tsx
    server.use(http.post('/api/lists/abc123/session', () => HttpResponse.json({ ok: true }, { status: 200 })));
```

with

```tsx
    server.use(mock('post', '/api/lists/{slug}/session', 200, { ok: true }));
```

and replace:

```tsx
    server.use(http.post('/api/lists/abc123/session', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));
```

with

```tsx
    server.use(mock('post', '/api/lists/{slug}/session', 404, { message: 'Not found' }));
```

- [ ] **Step 3: Run the tests and commit**

```bash
npm run lint && npm test && npm run build
git add apps/web/src/features/guest-key
git commit -m "test(web): guest-key tests mock through the OpenAPI contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

---

### Task 12: #18 `14-holds-ui`: move the holds tests to `mock()`

**Files:**
- Modify: `apps/web/src/features/holds/ItemView.test.tsx`
- Modify: `apps/web/src/features/holds/useHoldItem.test.tsx`

**Interfaces:**
- Consumes: `mock` (Task 9).

- [ ] **Step 1: Rebuild the branch**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/14-holds-ui restack/13-guest-key-ui
git cherry-pick 86b437f7d68116d67019b99e25b196fb7bfa0470..022f6b7889adfbd7604df3d5e3067162b8e1b9de
npm test --workspace=apps/web
```

- [ ] **Step 2: Convert `ItemView.test.tsx`**

Change the import to `import { mock } from '../../test/msw/mock';`, then replace the two handlers with:

```tsx
    server.use(mock('post', '/api/lists/{slug}/items/{itemId}/hold', 201, { holdId: 'hold-1', itemId: 'item-1', expiresAt: '2026-01-04T00:00:00.000Z' }));
```

and

```tsx
    server.use(mock('post', '/api/lists/{slug}/items/{itemId}/hold', 409, { message: 'Item already held' }));
```

- [ ] **Step 3: Convert `useHoldItem.test.tsx`**

These `http.get` handlers count requests and wait on a promise, so they need a resolver function. `mock()` only serves a fixed body, so keep raw MSW for those. Change only the plain `http.post` hold handler in the first test:

```tsx
      mock('post', '/api/lists/{slug}/items/{itemId}/hold', 409, { message: 'Item already held' }),
```

Keep the `http`/`HttpResponse` import, because the stateful handlers still use it. Add `import { mock } from '../../test/msw/mock';`. Add one comment above the stateful handlers:

```tsx
      // Stateful handlers (they count or delay requests), so raw MSW rather
      // than the fixed-response mock() helper.
```

- [ ] **Step 4: Run the tests and commit**

```bash
npm run lint && npm test && npm run build
git add apps/web/src/features/holds
git commit -m "test(web): holds tests mock through the OpenAPI contract

Stateful handlers in useHoldItem.test.tsx (request counting, delayed
refetch) stay on raw MSW; mock() serves fixed responses only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
```

---

### Task 13: #19 and #20: carry forward, then run the full verification including e2e

**Files:** none are changed by hand.

**Interfaces:**
- Consumes: `restack/14-holds-ui`.
- Produces: `restack/15-wire-it-together` and `restack/16-e2e-and-verification`, the complete rebuilt stack.

- [ ] **Step 1: Rebuild both branches**

```bash
cd /workspace/.worktrees/openapi-restack
git switch -c restack/15-wire-it-together restack/14-holds-ui
git cherry-pick 022f6b7889adfbd7604df3d5e3067162b8e1b9de..750fea4f8725be6e0b5f104b8e5b20249e8ae4f0
git switch -c restack/16-e2e-and-verification restack/15-wire-it-together
git cherry-pick 750fea4f8725be6e0b5f104b8e5b20249e8ae4f0..2265ee23c714dc9db2857f9a873dd1f24bf1a277
```

Both branches change `apps/web/package.json`, the root `package.json` and the lockfile. Use the lockfile rule. For a `package.json` conflict, keep both sides' lines: the new `gen:api` script and `openapi-fetch` / `@gubbins/api-typegen`, plus the branch's own additions.

- [ ] **Step 2: Check every rebuilt branch (the full stack)**

```bash
for b in 02-monorepo 03-domain 04-ports 05-create-and-key 06-hold-item 07-persistence 08-crypto-and-observability \
  09-presentation 10-web-scaffold 11-api-client 12-create-list-ui 13-guest-key-ui 14-holds-ui 15-wire-it-together 16-e2e-and-verification; do
  git switch -q restack/$b && npm ci --silent && npm run lint --silent && npm test --silent && npm run build --silent \
    && echo "PASS $b" || { echo "FAIL $b"; break; }
done
```

Expected: 15 `PASS` lines.

- [ ] **Step 3: Run the e2e test at the top of the stack**

```bash
git switch restack/16-e2e-and-verification && npm ci
npm run test:e2e
```

Expected: PASS. The Playwright test drives the real server through the new route schemas.

- [ ] **Step 4: Check the signatures and that no generated file is stale**

```bash
git log --format='%G?' origin/feat/walking-skeleton/01-adrs..restack/16-e2e-and-verification | sort | uniq -c
npm run gen:api && git status --porcelain apps/api/openapi.json apps/web/src/api/schema.gen.ts
```

Expected: only `G`, and no output from `git status`, which means both generated files are current.

---

### Task 14: #23: mark the old walking-skeleton plan as amended, and push the docs

**Files:**
- Modify: `docs/superpowers/plans/2026-09-12-walking-skeleton.md` (on branch `docs/walking-skeleton-design`, in `/workspace`)

- [ ] **Step 1: Add the note**

Insert this directly under the plan's title line:

```markdown
> **Amended 2026-09-29:** Tasks 11 and 13–16 (presentation, API client, and
> the three feature tests) were changed after execution by
> [the OpenAPI contract design](../specs/2026-09-29-openapi-contract-design.md)
> and [its plan](2026-09-29-openapi-contract.md): routes declare zod schemas
> that generate `apps/api/openapi.json`, and the web client and test mocks are
> typed from it. The code blocks below show the pre-amendment versions.
```

- [ ] **Step 2: Commit and push (an ordinary push, not a force-push)**

```bash
cd /workspace
git add docs/superpowers/plans/2026-09-12-walking-skeleton.md
git commit -m "docs: mark the walking-skeleton plan as amended by the OpenAPI contract work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RdJzbrWLV8Xvu5rEmGsgQn"
git push origin docs/walking-skeleton-design
```

---

### Task 15: Hand-off: the owner force-pushes, then the PR descriptions are updated

**Files:** none.

- [ ] **Step 1: Show the owner a summary table**

For each branch from `02-monorepo` to `16-e2e-and-verification`, show:
- the old SHA (from the reference table)
- the new SHA (`git rev-parse restack/<b>`)
- the number of new commits added on top (0 for carried-forward branches)

- [ ] **Step 2: Give the owner one atomic push command to run with `!`**

Build it from the table. Each lease names the old SHA, so the push fails if anyone has pushed to a branch since Task 1:

```bash
cd /workspace/.worktrees/openapi-restack && git push --atomic origin \
  --force-with-lease=feat/walking-skeleton/02-monorepo:6513f19257aaa5af4f1d0151f5a24e9f71ef8602 restack/02-monorepo:feat/walking-skeleton/02-monorepo \
  --force-with-lease=feat/walking-skeleton/03-domain:da81fe7a5e7c4e676f102a2f28d6376dd4632459 restack/03-domain:feat/walking-skeleton/03-domain \
  --force-with-lease=feat/walking-skeleton/04-ports:f42c2412ff5e30a03fdb3b70b481f4f09022c570 restack/04-ports:feat/walking-skeleton/04-ports \
  --force-with-lease=feat/walking-skeleton/05-create-and-key:fa9dfd0efe0bfa267d9688526e32a84cef57824c restack/05-create-and-key:feat/walking-skeleton/05-create-and-key \
  --force-with-lease=feat/walking-skeleton/06-hold-item:9c72169533c92b75e5a7ffa2d475892aafb92c41 restack/06-hold-item:feat/walking-skeleton/06-hold-item \
  --force-with-lease=feat/walking-skeleton/07-persistence:4f44b9ab3a0dc7dcb9dc503d52c89830b84e952d restack/07-persistence:feat/walking-skeleton/07-persistence \
  --force-with-lease=feat/walking-skeleton/08-crypto-and-observability:4536b321bde24320461e44430a41f2781fcfae4a restack/08-crypto-and-observability:feat/walking-skeleton/08-crypto-and-observability \
  --force-with-lease=feat/walking-skeleton/09-presentation:d48cca49b6dd2fffb6171a81a8f1c82f5dd8ea07 restack/09-presentation:feat/walking-skeleton/09-presentation \
  --force-with-lease=feat/walking-skeleton/10-web-scaffold:97a0296a65d3f19338a64ba82f0f5be92dd5753f restack/10-web-scaffold:feat/walking-skeleton/10-web-scaffold \
  --force-with-lease=feat/walking-skeleton/11-api-client:2dbe10adb857bb6a943373dd5f9530c151d701d4 restack/11-api-client:feat/walking-skeleton/11-api-client \
  --force-with-lease=feat/walking-skeleton/12-create-list-ui:47cc7fc4b08378d0a159e63fdac48ff5b40f088e restack/12-create-list-ui:feat/walking-skeleton/12-create-list-ui \
  --force-with-lease=feat/walking-skeleton/13-guest-key-ui:86b437f7d68116d67019b99e25b196fb7bfa0470 restack/13-guest-key-ui:feat/walking-skeleton/13-guest-key-ui \
  --force-with-lease=feat/walking-skeleton/14-holds-ui:022f6b7889adfbd7604df3d5e3067162b8e1b9de restack/14-holds-ui:feat/walking-skeleton/14-holds-ui \
  --force-with-lease=feat/walking-skeleton/15-wire-it-together:750fea4f8725be6e0b5f104b8e5b20249e8ae4f0 restack/15-wire-it-together:feat/walking-skeleton/15-wire-it-together \
  --force-with-lease=feat/walking-skeleton/16-e2e-and-verification:2265ee23c714dc9db2857f9a873dd1f24bf1a277 restack/16-e2e-and-verification:feat/walking-skeleton/16-e2e-and-verification
```

Stop and wait for the owner to run it.

- [ ] **Step 3: After the push, check the PRs**

```bash
for n in 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  gh pr view $n --repo dtbiedrzycki/gubbins --json number,baseRefName,commits,changedFiles,mergeable \
    --jq '"#\(.number) base=\(.baseRefName) commits=\(.commits|length) files=\(.changedFiles) \(.mergeable)"'
done
```

Expected:
- #6's commit count drops back to 10 (9 cherry-picked plus the zod commit).
- No PR shows ADR-rollout commits.
- Every PR is `MERGEABLE`. It may briefly show `UNKNOWN`; re-run after a few seconds.

- [ ] **Step 4: Add the note to the PR descriptions this change touched (#6, #13, #15, #16, #17, #18)**

For each of those PRs, append a section to the description with `gh pr edit <n> --body-file <file>`. Build the file from the current body (`gh pr view <n> --json body --jq .body`) plus:

```markdown

## Folded in: OpenAPI contract

Amended per [the OpenAPI contract design](https://github.com/dtbiedrzycki/gubbins/blob/docs/walking-skeleton-design/docs/superpowers/specs/2026-09-29-openapi-contract-design.md) (from the review thread on #15). New commits on top of this PR's original ones:

<one line per new commit: `<short sha> <subject>`>
```

- [ ] **Step 5: Remove the restack worktree**

```bash
cd /workspace && git worktree remove /workspace/.worktrees/openapi-restack
```

The local `restack/*` branches can stay until the owner is happy with the PRs. Delete them when asked.
