# Launch cut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One live registry. A guest on a phone holds, extends, releases and buys single items and pledges toward group gifts. The owner creates the list (with Venmo/Zelle handles) and adds items from `/{slug}/manage`.

**Architecture:** This extends the existing clean-architecture backend (domain → application → infrastructure → presentation) and the React SPA. Specifically:
- The `Wishlist` aggregate grows from one item to many, with item kinds `single | group`.
- `Contribution` is a new aggregate beside `Hold`.
- `GuestPii` is a side table outside rebuild.
- The owner authenticates by exchanging the owner token for a signed cookie, the same pattern as the guest key.
- A production container image and a CI smoke test ship it.

**Tech Stack:**
- Backend: Node 24.17, TypeScript 6, Fastify 5, zod 4, `fastify-type-provider-zod` 7, Kysely 0.29 over better-sqlite3 11, vitest 5.
- Web: React 19, TanStack Query 5, `openapi-fetch` 0.17, MSW, Tailwind 4, Testing Library.
- E2E: Playwright 1.63 with `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-10-13-launch-cut-design.md`. Read all of it. It amends the delivery order of `docs/superpowers/specs/2026-09-30-holds-lifecycle-design.md`, and that spec's §1–§3 still describe the hold model this plan builds on.

## Global Constraints

- **Every PR changes at most 10 files, generated files included** (`small-prs` skill). Check with `git diff --stat <base>...HEAD | tail -1` before opening. Each task below is one PR and lists every file it touches. If a task grows past 10, stop and split it; don't squeeze it.
- **Stacked PRs:**
  - Branch `feat/launch/NN-<name>` from the previous task's branch, and target that branch with the PR.
  - At most **8** open stacked PRs at once. When 8 are open, stop and ask the user to merge before opening more.
  - After a merge to main, rebase the next branch `--onto main` before retargeting it. Auto mode cannot force-push: hand the user `! git push --force-with-lease=<branch>:<old-sha> origin <branch>`.
- **Tests sit at the owning layer** (`testing-at-the-owning-layer` skill): one test per rule, in the layer that decides it. Routes test status codes, wiring and security matrices only. E2E covers one journey per user goal, plus axe.
- **Test names and comments use no plan identifiers.** Don't write task numbers, `L1`–`L12`, `D14` or `§` references in tests (ADR numbers are fine). In domain code the instant is called `at`, not `now`.
- **Schema:** amend `apps/api/src/infrastructure/db/migrations/0001_init.ts` in place (D14). Never add a `0002`. Every PR that changes it says in its description: "Dev databases must be recreated after this merges (0001_init amended in place, D14)."
- **Generated contract (ADR-0077):** after any change to a route or to a schema in `packages/shared-types`, run `npm run gen:api`. Commit `apps/api/openapi.json` and `apps/web/src/api/schema.gen.ts`, which the freshness tests check.
- **Errors:**
  - Every way of failing to reach a list, item or hold is the generic 404 `{ message: 'Not found' }` (ADR-0016/0054). That includes a wrong owner token and another list's owner cookie.
  - 409 bodies are `{ message, code }`, with messages written for a person.
  - A wrong create secret is 403 `{ message: 'Not allowed' }`.
- **Secrets travel only in JSON request bodies or signed `httpOnly`, `sameSite: 'strict'`, `secure: true` cookies.** Never in a URL, a query string, `localStorage` or a log line.
- **Copy:**
  - Say "hold", never "reserve".
  - Group-gift money is "pledged", never "paid".
  - The pledge button reads "I've sent it".
- **Money is USD only, in integer minor units.** Render it with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. `MAX_MONEY_MINOR = 10 ** 12` is the arithmetic bound (ADR-0061). A pledge may be at most 5 × the gift's price (ADR-0047).
- **Layering:** `domain/` imports nothing from `application/` or `infrastructure/`, so it takes collaborators as structural types. Nothing below `presentation/` calls `Date.now()` or `new Date()` to decide behaviour.
- **Green bar per PR:** `npm run lint && npm test && npm run build && npm run test:e2e` all pass. In this dev container, run web vitest as `npx vitest run --testTimeout=30000` from `apps/web`.
- **Commits:**
  - Signed (`git log --format='%h %G? %s'` shows `G`), with conventional prefixes.
  - End every message with:
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_018q4vDnmfeUGn5kQc8Wtr96
    ```
- **PR bodies** end with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_018q4vDnmfeUGn5kQc8Wtr96
  ```

## Review Focus

1. **A store URL that isn't `https:`** (`javascript:alert(1)`, `http://…`, `data:…`, a bare word). It's refused at the schema (400) and again by the `Item` constructor, and is never rendered into an `href`. Pinned in Task 9 (domain) and Task 13 (schema).
2. **A pledge amount typed by a person:** `$50`, `50.5`, `1,250.00`, `0`, `50.555`, `-5`, `abc`, an empty field, or a number far over the price. The client turns well-formed input into integer cents and says plainly what's wrong otherwise. The server refuses a non-integer, a value ≤ 0, or more than 5× the price with a readable 409 `amount_out_of_range`. Pinned in Task 22 (domain) and Task 29 (parser).
3. **A double tap on "I've sent it" or "Yes, hold it" over slow wifi.** The key is minted when the dialog opens and the button is disabled while pending, so one pledge or hold results. Pinned in Task 26 (replay) and Task 29 (pending state).
4. **An owner cookie from list A presented on list B, or a stale or wrong owner token.** Either gives the generic 404, and no item is added. Pinned in Task 6 and Task 13.
5. **Payment handles typed loosely:** `@my-venmo`, `  my_venmo  `, `(555) 123-4567`, `+1 555 123 4567`, `Me@Example.com`. They're normalized once at creation, and handles that can't be valid are refused with a message naming the field. Pinned in Task 9.

---

## Task order and dependencies

The tasks run in this order, each branch stacked on the last. The headings give each task's files.

| # | Branch suffix | Concern |
|---|---|---|
| 1 | `01-docs` | Spec, plan, three ADRs |
| 2 | `02-startup-config` | `CREATE_SECRET` / cookie secret at startup, secure cookie |
| 3 | `03-create-secret-field` | 403 mapping, optional `createSecret` field, form field |
| 4 | `04-create-secret-enforced` | `CreateList` refuses a wrong or missing secret |
| 5 | `05-container` | `/health`, Dockerfile, compose, CI smoke |
| 6 | `06-owner-session` | `POST /api/lists/:slug/owner-session` |
| 7 | `07-owner-access` | Owner flag in `AccessContext` |
| 8 | `08-multi-item` | `Wishlist` holds many items |
| 9 | `09-item-kinds` | Item `url`/`priceMinor`, `group` kind, `PaymentMethods` |
| 10 | `10-item-persistence` | Columns, `insertItem` port |
| 11 | `11-guest-pii-store` | `guest_pii` table and port |
| 12 | `12-error-mapping` | 400 for domain validation, 409 `no_payment_method` |
| 13 | `13-add-item-route` | `AddItem` use case and route |
| 14 | `14-create-with-handles` | Handles on `POST /api/lists` and the create form |
| 15 | `15-list-view-items` | `items[]` and `payment` in the list view |
| 16 | `16-web-item-cards` | Guest cards for many items |
| 17 | `17-manage-page` | `/:slug/manage` with token gate and add-item form, e2e |
| 18 | `18-hold-pii-domain` | `GuestDetails`, `piiRef` on `Hold`/`ItemHeld` |
| 19 | `19-hold-pii-persistence` | `holds.pii_ref`, rebuild |
| 20 | `20-hold-details-api` | Optional `name`/`message` on hold |
| 21 | `21-hold-details-web` | Hold dialog fields |
| 22 | `22-contribution-domain` | `Money`, `Contribution`, `Item.pledge` |
| 23 | `23-contribution-store` | `contributions` table and port |
| 24 | `24-contribution-ledger` | `ContributionPledged` in the ledger and rebuild |
| 25 | `25-hold-name-required` | `name` required on hold |
| 26 | `26-pledge-route` | `PledgeContribution` and route |
| 27 | `27-list-view-pledges` | `pledgedMinor`, drop the `item` field |
| 28 | `28-amount-error-code` | 409 `amount_out_of_range` |
| 29 | `29-web-contribute` | Contribute dialog, e2e |

Tracks in parallel are not worth it here: the tasks share files such as `routes.ts`, `0001_init.ts`, `InMemoryRepositories.ts` and `openapi.json`, so the stack runs linearly.

---

### Task 1: Docs — spec, plan, ADRs

The branch `docs/launch-cut-spec` already carries the spec. Rename it to `feat/launch/01-docs` and add this plan and the ADRs to it.

**Files:**
- Existing: `docs/superpowers/specs/2026-10-13-launch-cut-design.md`
- Create: `docs/superpowers/plans/2026-10-13-launch-cut.md` (this file)
- Modify: `docs/superpowers/specs/2026-10-13-launch-cut-design.md`. In Web, replace "The group option is disabled with an explanation when the list has no payment method" with "A group gift on a list with no payment method shows the server's `no_payment_method` message". The manage page loads no list data to decide with.
- Create: `docs/adr/0080-list-creation-always-requires-createsecret.md`
- Create: `docs/adr/0081-owner-session-keyed-by-slug-and-owner-token.md`
- Create: `docs/adr/0082-payment-handles-set-at-list-creation.md`
- Modify: `docs/adr/README.md` (three index rows after 079)
- Modify: `docs/superpowers/plans/2026-09-30-roadmap-to-full-spec.md`. Add a line under the table saying the launch cut (link to the spec) pulls a subset of sub-projects 2 and 3 forward and supersedes holds stacks B–G's order until go-live.

- [ ] **Step 1: Write the ADRs.** Copy the section layout of `docs/adr/0050-contribution-amount-recorded-only-at-i-ve-sent-it.md`: title, Status `Accepted`, Date `2026-10-13`, Deciders `dtbiedrzycki`, then Context, Decision, Alternatives considered and Consequences. Content:
  - **0080:** List creation always requires a `CREATE_SECRET` value. The app refuses to start without one, and a missing or wrong value gets a 403. This amends ADR-0014 (the self-lock after the first list is not built). Consequence: every instance operator must set the variable; the dev `.env.example` documents it.
  - **0081:** `/{slug}/manage` exchanges the owner token for a signed `gubbins_owner` cookie via `POST /api/lists/:slug/owner-session`. The route looks the list up by slug and compares the token in constant time (ADR-0035). This amends D17 of the holds design for this route: the slug is in the path, so no `owner_token_lookup` hash column is needed. A token-only paste flow on `/` would still need D17. The cookie lasts for the browser session.
  - **0082:** Venmo and Zelle handles are set at list creation, stored on the wishlist and can't be edited yet. A group gift can't be added to a list with neither. This narrows ADR-0044 to two kinds and defers the settings UI and the `custom` kind. Consequence: a typo needs a DB fix until editing exists (accepted by the owner on 2026-10-13).
- [ ] **Step 2: Add the README rows and the roadmap line.** Then run `python3 scripts/check_adr_links.py`. Expected: exit 0.
- [ ] **Step 3: Commit.** `git commit -m "docs: add the launch-cut plan and its ADRs"`. Then rename the branch: `git branch -m docs/launch-cut-spec feat/launch/01-docs`.

---

### Task 2: Startup config — secrets required, secure cookie

**Files:**
- Create: `apps/api/src/presentation/secretsConfig.ts`
- Create: `apps/api/src/presentation/secretsConfig.test.ts`
- Modify: `apps/api/src/presentation/server.ts`
- Modify: `apps/api/src/presentation/routes.ts` (session cookie gets `secure: true`)
- Modify: `playwright.config.ts` (`CREATE_SECRET: 'e2e-create-secret'` in `webServer.env`)
- Modify: `.env.example` (document `CREATE_SECRET`)

**Interfaces:**
- Produces: `parseCreateSecret(env: Record<string, string | undefined>): string` and `parseCookieSecret(env): string | null`. The latter returns null only outside production.

- [ ] **Step 1: Write the failing test** `secretsConfig.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCookieSecret, parseCreateSecret } from './secretsConfig.js';

describe('parseCreateSecret', () => {
  it('returns the configured value untouched', () => {
    expect(parseCreateSecret({ CREATE_SECRET: ' s3cret ' })).toBe(' s3cret ');
  });

  it.each([undefined, ''])('refuses to start without one (%j)', (value) => {
    expect(() => parseCreateSecret({ CREATE_SECRET: value })).toThrow(/CREATE_SECRET/);
  });
});

describe('parseCookieSecret', () => {
  it('returns the configured value', () => {
    expect(parseCookieSecret({ SESSION_COOKIE_SECRET: 'abc', NODE_ENV: 'production' })).toBe('abc');
  });

  it('refuses to start in production without one', () => {
    expect(() => parseCookieSecret({ SESSION_COOKIE_SECRET: '', NODE_ENV: 'production' })).toThrow(/SESSION_COOKIE_SECRET/);
  });

  it('allows the development fallback outside production', () => {
    expect(parseCookieSecret({ SESSION_COOKIE_SECRET: '', NODE_ENV: 'development' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.** `cd apps/api && npx vitest run src/presentation/secretsConfig.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `secretsConfig.ts`:

```ts
/**
 * Secrets read once at startup. A missing secret stops the server with a
 * message naming the variable, rather than serving an instance anyone can
 * create lists on (ADR-0080) or whose cookies anyone can forge.
 */
export function parseCreateSecret(env: Record<string, string | undefined>): string {
  const value = env.CREATE_SECRET;
  if (!value) throw new Error('CREATE_SECRET must be set: list creation always requires it (ADR-0080). Generate one with `openssl rand -base64 32`.');
  return value;
}

/** Null means "use the development fallback", which is allowed only outside production. */
export function parseCookieSecret(env: Record<string, string | undefined>): string | null {
  const value = env.SESSION_COOKIE_SECRET;
  if (value) return value;
  if (env.NODE_ENV === 'production') throw new Error('SESSION_COOKIE_SECRET must be set in production. Generate one with `openssl rand -base64 32`.');
  return null;
}
```

- [ ] **Step 4: Wire it into `server.ts`.** Next to `parseHoldPolicy`, call `parseCreateSecret(process.env)` and keep the result in `const createSecret`. Task 4 passes it on; this task fails startup without it. Replace the `cookieSecret` block with `const cookieSecret = parseCookieSecret(process.env)`, keep the existing warning when it's null, and use `cookieSecret ?? 'dev-only-insecure-secret-change-me'`. Add `void createSecret;`, with a one-line comment that the next change hands it to `CreateList`, so lint accepts the unused const.
- [ ] **Step 5: Mark the session cookie `secure`.** In `routes.ts`, the `setCookie` call gets `secure: true` (ADR-0036). Browsers accept `Secure` cookies on `http://localhost`, so e2e is unaffected, and `inject` ignores the flag.
- [ ] **Step 6: Update the e2e and dev config.** Add `CREATE_SECRET: 'e2e-create-secret'` to `playwright.config.ts`. In `.env.example`, add a commented `CREATE_SECRET=` block in the style of `SESSION_COOKIE_SECRET`.
- [ ] **Step 7: Run checks.** Run `npm run lint && npm test` (api) and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 8: Commit.** `feat(api): require CREATE_SECRET at startup and mark the session cookie secure`.

---

### Task 3: Create-secret field and 403 mapping

The field is optional on the wire for now. Task 4 enforces it, so this PR stays green on its own.

**Files:**
- Modify: `apps/api/src/domain/errors.ts` (add `InvalidCreateSecretError`)
- Modify: `apps/api/src/presentation/domainErrorResponse.ts` (status union gains `403`)
- Modify: `apps/api/src/presentation/domainErrorResponse.test.ts`
- Modify: `packages/shared-types/src/createList.ts` (`createSecret: z.string().optional()`)
- Modify: `apps/api/src/presentation/routes.ts` (document `403` on `createList`)
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts` (generated)
- Modify: `apps/web/src/features/create-list/CreateListForm.tsx`
- Modify: `apps/web/src/features/create-list/CreateListForm.test.tsx`
- Modify: `e2e/guest-manages-a-hold.spec.ts` (fill the field)

**Interfaces:**
- Produces: `class InvalidCreateSecretError extends Error {}`, and a `domainErrorResponse` row `InvalidCreateSecretError → { status: 403, body: { message: 'Not allowed' } }`.

- [ ] **Step 1: Write the failing mapping test.** In `domainErrorResponse.test.ts`, add `new InvalidCreateSecretError()` with `{ status: 403, body: { message: 'Not allowed' } }` to the existing table test.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement the error and the mapping.** In `errors.ts`:

```ts
/** The create secret was missing or wrong (ADR-0080). Presented as 403 with no detail. */
export class InvalidCreateSecretError extends Error {
  constructor() { super('Invalid create secret'); }
}
```

  In `domainErrorResponse.ts`, widen the return type to `403 | 404 | 409` and add the row first.
- [ ] **Step 4: Add the schema field.** In `createList.ts`, add `createSecret: z.string().optional()`. There's no `trim`: secrets are opaque, as in `bearerSecrets.test.ts`. In `routes.ts`, add `403: json('The create secret was missing or wrong (ADR-0080).', errorResponseSchema)` to the `createList` responses. Run `npm run gen:api`.
- [ ] **Step 5: Write the failing form test.** In `CreateListForm.test.tsx`, `fillAndSubmit` types into a `Create secret` field. Add a test that checks the request body carries the field:

```ts
it('sends the create secret with the list', async () => {
  let body: unknown;
  server.use(http.post('/api/lists', async ({ request }) => {
    body = await request.json();
    return HttpResponse.json({ slug: 'abc123', ownerToken: 'o', key: 'k', itemId: 'i' }, { status: 201 });
  }));
  await fillAndSubmit();
  await screen.findByText('k');
  expect(body).toMatchObject({ createSecret: 'the-secret' });
});
```

  (`fillAndSubmit` types `the-secret` into `Create secret`. Import `http`, `HttpResponse` from `msw`.)
- [ ] **Step 6: Implement the form field.** Add `createSecret` state and a labelled `Create secret` input (`type="password"`, `required`, `autoComplete="off"`) before the submit button. Pass it in `mutate`.
- [ ] **Step 7: Update the e2e.** In `guestOnNewList`, fill `Create secret` with `'e2e-create-secret'` before clicking `Create list`.
- [ ] **Step 8: Run checks.** Run the api tests, the web tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 9: Commit.** `feat: send a create secret with new lists and map its refusal to 403`.

---

### Task 4: `CreateList` enforces the secret

**Files:**
- Modify: `apps/api/src/application/use-cases/CreateList.ts`
- Modify: `apps/api/src/application/use-cases/CreateList.test.ts`
- Modify: `apps/api/src/presentation/compositionRoot.ts` (option `createSecret?: string`)
- Modify: `apps/api/src/presentation/server.ts` (pass it; remove the `void`)
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify: `apps/api/src/presentation/ledgerActors.integration.test.ts`
- Modify: `apps/api/src/presentation/concurrency.integration.test.ts`

**Interfaces:**
- Consumes: `InvalidCreateSecretError` (Task 3), and `SecretComparer` (`application/ports/SecretComparer.ts`).
- Produces: `new CreateList(unitOfWork, tokenGenerator, clock, secretComparer, createSecret: string | null)`. `CreateListInput` gains `createSecret?: string`. With `createSecret === null`, every creation is refused (fail closed). `BuildDependenciesOptions.createSecret?: string`.

- [ ] **Step 1: Write the failing use-case tests:**

```ts
it.each([undefined, '', 'wrong'])('refuses creation with a missing or wrong secret (%j), persisting nothing', async (candidate) => {
  const { store, unitOfWork } = inMemoryPersistence();
  const createList = new CreateList(unitOfWork, new SequentialTokenGenerator(), new FixedClock(), new PlainSecretComparer(), 'right');
  await expect(createList.execute({ listTitle: 'L', itemTitle: 'I', createSecret: candidate })).rejects.toThrow(InvalidCreateSecretError);
  expect(store.wishlists.size).toBe(0);
});

it('refuses every creation when no secret is configured', async () => {
  const { unitOfWork } = inMemoryPersistence();
  const createList = new CreateList(unitOfWork, new SequentialTokenGenerator(), new FixedClock(), new PlainSecretComparer(), null);
  await expect(createList.execute({ listTitle: 'L', itemTitle: 'I', createSecret: 'anything' })).rejects.toThrow(InvalidCreateSecretError);
});
```

  Existing tests construct `CreateList` with `'right'` and pass `createSecret: 'right'`. Copy the exact helper names from the existing test file's imports.
- [ ] **Step 2: Run the tests.** Expected: FAIL (arity, then no refusal).
- [ ] **Step 3: Implement.** At the top of `execute`, before the unit of work:

```ts
// Fail closed: no configured secret means no one may create (ADR-0080).
if (this.createSecret === null || !this.secretComparer.compareInConstantTime(this.createSecret, input.createSecret ?? '')) {
  throw new InvalidCreateSecretError();
}
```

  `compositionRoot.ts`: `new CreateList(unitOfWork, tokenGenerator, clock, secretComparer, options.createSecret ?? null)`. `server.ts`: `buildDependencies(db, logger, { holdPolicy, createSecret })`.
- [ ] **Step 4: Update the integration tests.** Every file that POSTs `/api/lists` builds its deps with `buildDependencies(db, undefined, { createSecret: 'test-create-secret' })`, adding the option to whatever options the call already passes, and sends `createSecret: 'test-create-secret'` in the body. In `routes.integration.test.ts`, add one route test: a wrong secret gives 403 `{ message: 'Not allowed' }`.
- [ ] **Step 5: Run checks.** Run the api tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(api): refuse list creation without the create secret`.

---

### Task 5: Container — `/health`, Dockerfile, compose, CI smoke

**Files:**
- Modify: `apps/api/src/presentation/app.ts` (`GET /health` → `{ ok: true }`, outside `/api`, with `schema: { hide: true }` so the OpenAPI document is unchanged)
- Modify: `apps/api/src/presentation/routes.integration.test.ts` (one test: `/health` is 200)
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.prod.yml`
- Create: `scripts/container-smoke.sh`
- Modify: `.github/workflows/ci.yml` (job `container-smoke`)
- Create: `docs/deploy.md`

- [ ] **Step 1: Write the failing `/health` test** in `routes.integration.test.ts`:
  `expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)`.
- [ ] **Step 2: Implement the route.** In `app.ts`, register `app.get('/health', { schema: { hide: true } }, async () => ({ ok: true }))` before the SPA fallback. It's an ops probe, not part of the API contract. Run the test (PASS). `npm run gen:api` must leave `openapi.json` unchanged; the freshness test checks it.
- [ ] **Step 3: Write the `Dockerfile`:**

```dockerfile
# Production image (the dev image is .devcontainer/Dockerfile.dev).
FROM node:24.17-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 falls back to compiling when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/api-typegen/package.json packages/api-typegen/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.17-bookworm-slim
# NODE_ENV only here, in the runtime layer: the build needs dev dependencies.
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/wishlist.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages/shared-types/package.json packages/shared-types/
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/api/dist/presentation/server.js"]
```

  If `npm ci` creates an `apps/api/node_modules` (hoisting conflicts), also copy it. Confirm with `ls apps/api/node_modules` in the build stage. The server's default `WEB_DIST` resolves from `apps/api/dist/presentation` to `apps/web/dist`. Verify it in Step 6.
- [ ] **Step 4: Write `.dockerignore`:** `node_modules`, `**/node_modules`, `**/dist`, `data`, `.env`, `test-results`, `.git`, `.superpowers`.
- [ ] **Step 5: Write `docker-compose.prod.yml`.** One `app` service built from `.`, plus:
  - `restart: unless-stopped` and `ports: ["127.0.0.1:3000:3000"]`. The tunnel connects locally; never publish to the LAN.
  - A named volume `gubbins-data:/data`.
  - `env_file: .env.prod`, holding `CREATE_SECRET` and `SESSION_COOKIE_SECRET`.
- [ ] **Step 6: Write `scripts/container-smoke.sh`.** It needs bash with `set -euo pipefail` and a `trap` that removes the container. Steps:
  1. `docker build -t gubbins:smoke .`
  2. Run without `CREATE_SECRET` and assert a non-zero exit: `! docker run --rm -e SESSION_COOKIE_SECRET=x gubbins:smoke`.
  3. Start detached with both secrets and a fresh volume. Poll `curl -fsS http://127.0.0.1:3000/health` for up to 30 s.
  4. Assert that `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"listTitle":"L","itemTitle":"I","createSecret":"wrong"}' http://127.0.0.1:3000/api/lists` prints `403`.
  5. Assert that `GET /` returns 200 and contains `<div id="root">`, which proves the SPA was copied.

  Run it locally if Docker is available. Otherwise rely on CI and say so in the PR.
- [ ] **Step 7: Add the CI job.** In `ci.yml`, add `container-smoke: runs-on: ubuntu-latest; steps: checkout, run: bash scripts/container-smoke.sh`.
- [ ] **Step 8: Write `docs/deploy.md`.** About 40 lines, covering:
  - Generating secrets with `openssl rand -base64 32`.
  - `.env.prod`, then `docker compose -f docker-compose.prod.yml up -d --build`.
  - Pointing the tunnel (for example `cloudflared`) at `http://127.0.0.1:3000`.
  - Keeping `TRUSTED_PROXY_HOPS` unset, since nothing reads it yet.
  - Upgrading: rebuild, and the volume persists. Before go-live a schema change means deleting the DB; after go-live it needs a real migration.
  - The manual go-live checklist from the spec.
- [ ] **Step 9: Run checks.** Run `npm test`, then `bash scripts/container-smoke.sh` (or let CI run it).
- [ ] **Step 10: Commit.** `feat: production container, /health and a CI smoke test`.

---

### Task 6: Owner session route

**Files:**
- Create: `apps/api/src/application/use-cases/EnterOwnerToken.ts`
- Create: `apps/api/src/application/use-cases/EnterOwnerToken.test.ts`
- Create: `packages/shared-types/src/ownerSession.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/api/src/presentation/accessContext.ts` (`OWNER_COOKIE`, `OwnerSessionPayload`)
- Modify: `apps/api/src/presentation/compositionRoot.ts`
- Modify: `apps/api/src/presentation/routes.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces:
  - `EnterOwnerToken.execute({ slug, ownerToken }): Promise<{ wishlistId: string }>`. It throws `WishlistNotFoundError` for an unknown slug **and** for a wrong token, deliberately the same.
  - `ownerSessionRequestSchema = z.object({ ownerToken: z.string().min(1) })` and `ownerSessionResponseSchema = z.object({ ok: z.literal(true) })`.
  - `export const OWNER_COOKIE = 'gubbins_owner'` and `export interface OwnerSessionPayload { wishlistId: string }`.
  - Route `POST /api/lists/:slug/owner-session`, operationId `enterOwnerToken`.

- [ ] **Step 1: Write the failing use-case test.** Mirror `EnterGuestKey.test.ts`:

```ts
it('accepts the list\'s owner token', async () => {
  // seed a list with ownerToken 'owner-tok' (aWishlist() default) via store.wishlists
  await expect(useCase.execute({ slug: 'abc123', ownerToken: 'owner-tok' })).resolves.toEqual({ wishlistId: WISHLIST_ID });
});

it.each([['wrong token', 'abc123', 'nope'], ['unknown list', 'no-such', 'owner-tok']])('fails the same way for a %s', async (_case, slug, ownerToken) => {
  await expect(useCase.execute({ slug, ownerToken })).rejects.toThrow(WishlistNotFoundError);
});
```

- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement** `EnterOwnerToken.ts`. Its constructor takes `(wishlists: WishlistRepository, secretComparer: SecretComparer, clock: Clock)`. It runs `findBySlug(slug, clock.now())` and then `wishlist.ownerToken.matches(input.ownerToken, comparer)`. Comment that a wrong token throws the same `WishlistNotFoundError` as an unknown slug, so the two can't be told apart (ADR-0016).
- [ ] **Step 4: Add the shared schemas** in `ownerSession.ts` and export them from `index.ts`.
- [ ] **Step 5: Write the failing route tests** in `routes.integration.test.ts`:
  - The right token gives 200 `{ ok: true }` and a `set-cookie` starting `gubbins_owner=` that includes `HttpOnly`, `Secure` and `SameSite=Strict`.
  - A wrong token and an unknown slug both give 404 `{ message: 'Not found' }`, with no `set-cookie`.
- [ ] **Step 6: Implement the route.** Copy the shape of the `/session` route:

```ts
app.post('/api/lists/:slug/owner-session', {
  schema: {
    operationId: 'enterOwnerToken', params: slugParams, body: ownerSessionRequestSchema,
    response: {
      200: json('The token was accepted and an owner cookie was set.', ownerSessionResponseSchema),
      400: json(INVALID_REQUEST, errorResponseSchema),
      404: json('No such list, or the token is wrong. Deliberately indistinguishable (ADR-0016, ADR-0054).', errorResponseSchema),
    },
  },
}, async (request, reply) => {
  try {
    const { wishlistId } = await deps.enterOwnerToken.execute({ slug: request.params.slug, ownerToken: request.body.ownerToken });
    const payload: OwnerSessionPayload = { wishlistId };
    reply.setCookie(OWNER_COOKIE, JSON.stringify(payload), { path: '/', httpOnly: true, signed: true, sameSite: 'strict', secure: true });
    return reply.code(200).send({ ok: true });
  } catch (err) {
    if (err instanceof WishlistNotFoundError) return reply.code(404).send(NOT_FOUND);
    throw err;
  }
});
```

  Wire `enterOwnerToken: new EnterOwnerToken(wishlists, secretComparer, clock)` in `compositionRoot.ts` and add it to `AppDependencies`. Run `npm run gen:api`.
- [ ] **Step 7: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 8: Commit.** `feat(api): exchange the owner token for an owner cookie`.

---

### Task 7: Owner flag in `AccessContext`

**Files:**
- Modify: `apps/api/src/application/AccessContext.ts`
- Modify: `apps/api/src/presentation/accessContext.ts`
- Modify: `apps/api/src/presentation/accessContext.test.ts`
- Modify: `apps/api/src/presentation/routes.ts` (pass the owner session into `accessContextFor`)

**Interfaces:**
- Produces:
  - `AccessContext.owner?: boolean`. It's optional so existing guest-only literals stay valid; `true` only when the request carries an owner cookie for this list.
  - `readOwnerSession(request): OwnerSessionPayload | null`.
  - `accessContextFor(sessions: { guest: SessionPayload | null; owner: OwnerSessionPayload | null }, list, hasher): AccessContext`.

- [ ] **Step 1: Write the failing tests** in `accessContext.test.ts`. Adjust the existing calls to the new `{ guest, owner: null }` shape, then add:

```ts
it('marks the owner for an owner cookie on this list', () => {
  expect(accessContextFor({ guest: null, owner: { wishlistId: LIST.id } }, LIST, hasher).owner).toBe(true);
});

it('ignores an owner cookie for another list', () => {
  expect(accessContextFor({ guest: null, owner: { wishlistId: 'other' } }, LIST, hasher).owner).toBe(false);
});
```

  Add a `readOwnerSession` test for a tampered or unsigned cookie returning null, if `readSignedSession` has one to mirror.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** `readOwnerSession` copies `readSignedSession` for `OWNER_COOKIE`, with a `typeof payload?.wishlistId === 'string'` check. `accessContextFor` returns `{ guestSession, owner: sessions.owner?.wishlistId === list.id }`. In `routes.ts`, `guestAccess` calls it with `{ guest: session, owner: null }`. Owner routes arrive in Task 13.
- [ ] **Step 4: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): carry the owner credential in AccessContext`.

---

### Task 8: `Wishlist` holds many items

**Files:**
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.test.ts`
- Modify: `apps/api/src/application/views/HoldView.test.ts` (`item` → `items: [item]`)
- Modify: `apps/api/src/application/test-fakes/builders.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/ItemRepositoryKysely.ts`
- Modify: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`

**Interfaces:**
- Produces:
  - `Wishlist.items: readonly Item[]`, in insertion order.
  - `Wishlist.item: Item | null`, kept as `items[0] ?? null` until Task 27 removes it, so `GetListView` keeps compiling.
  - `Wishlist.reconstitute({ ..., items?: readonly Item[], holds? })`. `items` replaces `item`; every hold must be on one of `items`.
  - `addItem` no longer throws on a second item.
  - `ItemRepositoryKysely.findAllByWishlistId(wishlistId): Promise<Item[]>`, ordered by `created_at, id`.

- [ ] **Step 1: Write the failing domain tests** in `Wishlist.test.ts`. Replace the "already has an item" test with:

```ts
it('takes several items, each reachable by id', () => {
  const wishlist = aWishlist().build();
  const ids = ['33333333-3333-7333-8333-333333333331', '33333333-3333-7333-8333-333333333332'];
  let next = 0;
  for (const title of ['Stroller', 'Crib']) wishlist.addItem({ title }, { generateEntityId: () => ids[next++] });
  expect(wishlist.items.map((i) => i.title)).toEqual(['Stroller', 'Crib']);
  expect(wishlist.getItem(ids[1]).title).toBe('Crib');
});

it('decides availability per item: a hold on one leaves the other available', () => {
  // two items, one active hold on the first (Hold.reconstitute as in the existing purchased-count test)
  expect(wishlist.itemStatus(FIRST)).toBe('held');
  expect(wishlist.itemStatus(SECOND)).toBe('available');
});
```

  Change the `reconstitute` tests from `item` to `items: [item]`. The "hold on an item outside this wishlist" test now checks against `items`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Replace `_item: Item | null` with `_items: Item[]`:
  - `getItem` uses `find` (else `ItemNotFoundError`).
  - `owns(hold)` is `this._items.some((i) => i.id.value === hold.itemId.value)`.
  - `itemOf(hold)` returns that item (else `HoldNotFoundError`).
  - `reconstitute` checks every item's `wishlistId` and every hold's `itemId` against the set.
  - `addItem` pushes. Keep `get item()` with a one-line comment: "First item; removed once the list view reads `items`."
- [ ] **Step 4: Update the adapters.**
  - `WishlistRepositoryKysely.insert` inserts every item. `hydrate` calls `this.items.findAllByWishlistId(row.id)`.
  - `ItemRepositoryKysely`: rename `findByWishlistId` to `findAllByWishlistId`, returning an array ordered by `items.created_at, items.id`.
  - `InMemoryRepositories`: `insert` stores every item, and `hydrate` passes every item on the list (store insertion order).
  - `builders.ts`: `withItem` may be called more than once (it keeps an array). `build()` adds each and builds purchased holds on the first.
- [ ] **Step 5: Extend the contract.** In `wishlistRepository.contract.ts`, add: "loads every item of the list, in the order they were added". Insert a wishlist with two items via `Wishlist.create` + `addItem` ×2 + `insert`, then assert `items.map(i => i.id.value)` after `findById`. Update the existing `.item` assertions only where they break.
- [ ] **Step 6: Run checks.** `cd apps/api && npm test`. Expected: PASS.
- [ ] **Step 7: Commit.** `feat(api): let a wishlist hold many items`.

---

### Task 9: Item kinds, item fields, payment methods (domain)

**Files:**
- Create: `apps/api/src/domain/value-objects/PaymentMethods.ts`
- Create: `apps/api/src/domain/value-objects/PaymentMethods.test.ts`
- Modify: `apps/api/src/domain/entities/Item.ts`
- Modify: `apps/api/src/domain/entities/Item.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.test.ts`
- Modify: `apps/api/src/domain/errors.ts` (`NoPaymentMethodError`)
- Modify: `apps/api/src/application/use-cases/CreateList.ts` (`addItem({ type: 'single', title })`)
- Modify: `apps/api/src/application/test-fakes/builders.ts` (same `type`, plus `withPaymentMethods`)

**Interfaces:**
- Produces:

```ts
// PaymentMethods.ts
export class PaymentMethods {
  static readonly none: PaymentMethods;
  /** Normalizes once: Venmo drops a leading '@' and surrounding space; Zelle lower-cases an email or keeps a US phone as +1 and 10 digits. Empty or blank means absent. */
  static from(props: { venmoHandle?: string | null; zelleHandle?: string | null }): PaymentMethods;
  readonly venmoHandle: string | null;
  readonly zelleHandle: string | null;
  isEmpty(): boolean;
}
// Item
type ItemType = 'single' | 'group';
Item.createSingle(props: { id; wishlistId; title; quantity?: number; url?: string | null; priceMinor?: number | null }): Item
Item.createGroup(props: { id; wishlistId; title; priceMinor: number; url?: string | null }): Item
Item.reconstitute(props: { id; wishlistId; type: string; title; quantity; url?: string | null; priceMinor?: number | null; seq }): Item  // url/priceMinor default to null, so adapters compile until Task 10 stores them
readonly type: ItemType; readonly url: string | null; readonly priceMinor: number | null;
export const MAX_MONEY_MINOR = 10 ** 12; // in Item.ts for now; Task 22 moves it to Money.ts
// Wishlist
Wishlist.create({ ..., paymentMethods?: PaymentMethods })  // default PaymentMethods.none
Wishlist.reconstitute({ ..., paymentMethods?: PaymentMethods })
readonly paymentMethods: PaymentMethods
addItem(props: { type: 'single'; title: string; quantity?: number; url?: string | null; priceMinor?: number | null }
             | { type: 'group'; title: string; priceMinor: number; url?: string | null }, ids): Item
// errors.ts
export class NoPaymentMethodError extends Error { constructor() { super('A group gift needs at least one payment method on the list'); } }
```

- [ ] **Step 1: Write the failing `PaymentMethods.test.ts`:**

```ts
describe('PaymentMethods.from', () => {
  it.each([['@my-venmo', 'my-venmo'], ['  my_venmo  ', 'my_venmo']])('normalizes the Venmo handle %j', (raw, expected) => {
    expect(PaymentMethods.from({ venmoHandle: raw }).venmoHandle).toBe(expected);
  });
  it.each(['ab', 'has space', 'a'.repeat(31), 'bad!chars'])('refuses Venmo handle %j', (raw) => {
    expect(() => PaymentMethods.from({ venmoHandle: raw })).toThrow(/Venmo/);
  });
  it.each([['Me@Example.com', 'me@example.com'], ['(555) 123-4567', '+15551234567'], ['+1 555 123 4567', '+15551234567']])('normalizes the Zelle handle %j', (raw, expected) => {
    expect(PaymentMethods.from({ zelleHandle: raw }).zelleHandle).toBe(expected);
  });
  it.each(['not-an-email', '555-1234', '+44 20 7946 0958'])('refuses Zelle handle %j', (raw) => {
    expect(() => PaymentMethods.from({ zelleHandle: raw })).toThrow(/Zelle/);
  });
  it('treats blank handles as absent', () => {
    expect(PaymentMethods.from({ venmoHandle: '  ', zelleHandle: '' }).isEmpty()).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `PaymentMethods.ts`.** Throw `DomainValidationError` with messages that start `Venmo handle` or `Zelle handle`. Rules:
  - **Venmo:** after trimming and stripping one leading `@`, it must match `/^[A-Za-z0-9_-]{5,30}$/`.
  - **Zelle:** trimmed. If it contains `@`, it must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` and is lower-cased. Otherwise strip non-digits: 10 digits becomes `+1` followed by the digits, and 11 digits starting with `1` becomes `+` followed by the digits; anything else is refused.
  - `from` is idempotent on its own output, so reconstitution can call it again.
- [ ] **Step 3: Write the failing `Item.test.ts` tests:**

```ts
it.each(['javascript:alert(1)', 'http://shop.example/x', 'data:text/html,hi', 'shop.example', 'https://' + 'a'.repeat(2050)])('refuses a store URL that is not a short https URL (%j)', (url) => {
  expect(() => Item.createSingle({ id: ID, wishlistId: WL, title: 'T', url })).toThrow(DomainValidationError);
});
it('keeps an https store URL', () => {
  expect(Item.createSingle({ id: ID, wishlistId: WL, title: 'T', url: 'https://shop.example/x' }).url).toBe('https://shop.example/x');
});
it.each([0, -1, 1.5, 10 ** 12 + 1])('refuses price %j', (priceMinor) => {
  expect(() => Item.createSingle({ id: ID, wishlistId: WL, title: 'T', priceMinor })).toThrow(DomainValidationError);
});
it('takes a quantity for a single', () => {
  expect(Item.createSingle({ id: ID, wishlistId: WL, title: 'T', quantity: 3 }).quantity).toBe(3);
});
it('a group gift is one unit with a required price', () => {
  const group = Item.createGroup({ id: ID, wishlistId: WL, title: 'Mixer', priceMinor: 45000 });
  expect([group.type, group.quantity, group.priceMinor]).toEqual(['group', 1, 45000]);
  expect(() => Item.reconstitute({ id: ID, wishlistId: WL, type: 'group', title: 'M', quantity: 1, url: null, priceMinor: null, seq: 0 })).toThrow(DomainValidationError);
});
it('cannot be held when it is a group gift', () => {
  const group = Item.createGroup({ id: ID, wishlistId: WL, title: 'Mixer', priceMinor: 45000 });
  expect(() => group.placeHold(/* props, 0, 0, tokens, hasher as in existing placeHold tests */)).toThrow(ItemUnavailableError);
});
```

  Update the existing `reconstitute` calls with `url: null, priceMinor: null`, and replace the "type must be single" test with "refuses an unknown type".
- [ ] **Step 4: Implement `Item`.**
  - The constructor gains `url` and `priceMinor` and validates:
    - type is `single` or `group`;
    - url is null, or ≤ 2048 characters with `new URL(url).protocol === 'https:'` (catch the parse error and throw `DomainValidationError`);
    - priceMinor is null, or a safe integer `1..MAX_MONEY_MINOR`;
    - a group has `priceMinor !== null && quantity === 1`.
  - At the top of `placeHold`, add `if (this.type === 'group') throw new ItemUnavailableError(this.id.value);` with the comment "Group gifts take pledges, never holds; the UI never offers one."
  - `createSingle` trims the title and defaults quantity to 1 and url and price to null. `createGroup` uses quantity 1.
- [ ] **Step 5: Write the failing `Wishlist.test.ts` tests:**

```ts
it('refuses a group gift on a list with no payment method', () => {
  const wishlist = aWishlist().build();
  expect(() => wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, ids)).toThrow(NoPaymentMethodError);
});
it('accepts a group gift once the list has a payment method', () => {
  const wishlist = aWishlist().withPaymentMethods(PaymentMethods.from({ venmoHandle: 'my-venmo' })).build();
  expect(wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, ids).type).toBe('group');
});
```

- [ ] **Step 6: Implement `Wishlist`.** Add a `paymentMethods` constructor field (default `PaymentMethods.none`). `addItem` switches on `props.type`. In the `group` branch, `if (this.paymentMethods.isEmpty()) throw new NoPaymentMethodError()` before `createGroup`. Update `CreateList.ts` and `builders.ts` to pass `type: 'single'`. In `builders.ts`, add `withPaymentMethods(pm)`, passed to `create` and `reconstitute`.
- [ ] **Step 7: Run checks.** Run the api tests. Expected: PASS. Persistence doesn't store the new fields yet. Because `reconstitute` defaults `url` and `priceMinor` to null, the adapters and fakes compile unchanged, and Task 10 stores them.
- [ ] **Step 8: Commit.** `feat(api): item kinds, store URL and price, and list payment methods`.

---

### Task 10: Persistence for item fields and payment methods; `insertItem`

**Files:**
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts`
- Modify: `apps/api/src/infrastructure/db/schema.ts`
- Modify: `apps/api/src/application/ports/WishlistRepository.ts` (`insertItem`)
- Modify: `apps/api/src/infrastructure/WishlistRepositoryKysely.ts`
- Modify: `apps/api/src/infrastructure/ItemRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Modify: `apps/api/src/application/ports/contracts/wishlistRepository.contract.ts`

**Interfaces:**
- Produces: `WishlistRepository.insertItem(item: Item): Promise<void>`, which inserts the item and its `item_state` row. It throws `WishlistNotFoundError` unless `item.wishlistId` exists. Columns:
  - `items.url text null`, `items.price_minor integer null`.
  - `CHECK (type IN ('single','group'))` and `CHECK (type = 'single' OR (price_minor IS NOT NULL AND quantity = 1))`.
  - `wishlists.venmo_handle text null`, `wishlists.zelle_handle text null`, `wishlists.currency text not null default 'USD'`.

- [ ] **Step 1: Write the failing contract tests:**

```ts
it('round-trips payment methods and item fields', async () => {
  const wishlist = Wishlist.create({ id: LIST_C, slug: 'list-c', title: 'C', ownerToken: 'o', key: 'k', asOf: NOW,
    paymentMethods: PaymentMethods.from({ venmoHandle: 'my-venmo', zelleHandle: 'me@example.com' }) });
  wishlist.addItem({ type: 'single', title: 'Crib', quantity: 2, url: 'https://shop.example/crib', priceMinor: 19999 }, { generateEntityId: () => ITEM_C1 });
  wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, { generateEntityId: () => ITEM_C2 });
  await fx.wishlists.insert(wishlist);
  const loaded = await fx.wishlists.findById(LIST_C, NOW);
  expect(loaded?.paymentMethods.venmoHandle).toBe('my-venmo');
  expect(loaded?.paymentMethods.zelleHandle).toBe('me@example.com');
  expect(loaded?.getItem(ITEM_C1)).toMatchObject({ type: 'single', quantity: 2, url: 'https://shop.example/crib', priceMinor: 19999 });
  expect(loaded?.getItem(ITEM_C2)).toMatchObject({ type: 'group', quantity: 1, priceMinor: 45000 });
});

it('insertItem adds an item to an existing list, with its stream at seq 0', async () => {
  const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
  const item = wishlist.addItem({ type: 'single', title: 'Bib' }, { generateEntityId: () => ITEM_A2 });
  await fx.wishlists.insertItem(item);
  const reloaded = await fx.wishlists.findById(LIST_A, NOW);
  expect(reloaded?.items.map((i) => i.id.value)).toEqual([ITEM_A, ITEM_A2]);
  expect(reloaded?.getItem(ITEM_A2).seq).toBe(0);
});
```

  Define `LIST_C`, `ITEM_C1`, `ITEM_C2` and `ITEM_A2` as UUIDv7-shaped constants local to the contract file, following `fixture.ts`'s style.
- [ ] **Step 2: Run the tests** against both runners (`InMemoryRepositories.contract.test.ts` and `contracts.integration.test.ts`). Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the migration columns with checks (`.addCheckConstraint(...)`, as `holds` does) and the schema types.
  - `WishlistRepositoryKysely`: write and read the handles via `PaymentMethods.from`. `insertItem` checks that the wishlist row exists (else `WishlistNotFoundError(item.wishlistId.value)`), then calls `this.items.insert(item)`.
  - `ItemRepositoryKysely`: write and read `url` and `price_minor`.
  - In-memory: `insertItem` throws `WishlistNotFoundError` unless the wishlist is in the store, else sets `store.items`. `hydrate` passes `paymentMethods: wishlist.paymentMethods`.
- [ ] **Step 4: Run checks.** `cd apps/api && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): persist item fields, payment methods and added items`.

---

### Task 11: `guest_pii` store

**Files:**
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts` (`guest_pii`)
- Modify: `apps/api/src/infrastructure/db/schema.ts`
- Create: `apps/api/src/application/ports/GuestPiiRepository.ts`
- Modify: `apps/api/src/application/ports/UnitOfWork.ts` (`guestPii` on `TransactionContext`)
- Modify: `apps/api/src/infrastructure/UnitOfWorkKysely.ts`
- Create: `apps/api/src/infrastructure/GuestPiiRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Create: `apps/api/src/application/ports/contracts/guestPiiRepository.contract.ts`
- Modify: `apps/api/src/infrastructure/contracts.integration.test.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.contract.test.ts`

**Interfaces:**
- Produces:

```ts
export interface GuestPiiRecord { id: string; name: string; message: string | null }
export interface GuestPiiRepository {
  insert(record: GuestPiiRecord): Promise<void>;
  findById(id: string): Promise<GuestPiiRecord | null>;
}
// TransactionContext gains: guestPii: GuestPiiRepository
```

  Table: `guest_pii (id text pk, name text not null, message text null CHECK (message IS NULL OR length(message) <= 300), redacted_at text null, created_at text not null)`. Comment it as outside `rebuildProjections` (ADR-0057). `inMemoryPersistence()` returns `guestPii` too.

- [ ] **Step 1: Write the contract** `describeGuestPiiRepositoryContract(adapter, factory)`. It tests that a record round-trips by id, that an unknown id gives null, and that a second insert with the same id throws. Register it in both runner files the way the other contracts are registered. Extend `PersistenceFixture` (in `fixture.ts`) only if it can't reach `guestPii` otherwise. If you must, that makes 11 files: move the `UnitOfWorkKysely` change out by having the fixture build `GuestPiiRepositoryKysely` directly, and wire the unit of work in Task 20 instead.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement** the table, the Kysely adapter (`created_at: new Date().toISOString()`, the bookkeeping exception), the in-memory fake (a `Map` in `InMemoryStore`, with a duplicate-id throw that mirrors the primary key), and the `TransactionContext` wiring.
- [ ] **Step 4: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): a guest_pii side table outside the ledger`.

---

### Task 12: Error mapping — 400 for domain validation, 409 `no_payment_method`

**Files:**
- Modify: `packages/shared-types/src/errorResponse.ts` (code `no_payment_method`)
- Modify: `apps/api/src/presentation/domainErrorResponse.ts`
- Modify: `apps/api/src/presentation/domainErrorResponse.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces two mappings:
  - `NoPaymentMethodError → 409 { message: 'Add a Venmo or Zelle handle to this list before adding a group gift.', code: 'no_payment_method' }`.
  - `DomainValidationError → 400 { message: err.message }`. Domain messages are written to be shown, such as "Venmo handle …".
- The status union becomes `400 | 403 | 404 | 409`.

- [ ] **Step 1: Add the two rows to the table test.** Expected: FAIL.
- [ ] **Step 2: Implement.** Put `DomainValidationError` **last**, so subclasses mapped earlier keep their status. Add the code to `errorCodeSchema`, then run `npm run gen:api`.
- [ ] **Step 3: Run checks.** Run the api and shared-types tests. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): map domain validation and missing payment methods to readable errors`.

---

### Task 13: `AddItem` use case and route

**Files:**
- Create: `apps/api/src/application/use-cases/AddItem.ts`
- Create: `apps/api/src/application/use-cases/AddItem.test.ts`
- Create: `packages/shared-types/src/addItem.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/api/src/presentation/compositionRoot.ts`
- Modify: `apps/api/src/presentation/routes.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Consumes: `AccessContext.owner` (Task 7), `readOwnerSession` (Task 7), `Wishlist.addItem` (Task 9), `WishlistRepository.insertItem` (Task 10).
- Produces:

```ts
// shared-types addItem.ts
const httpsUrl = z.url({ protocol: /^https$/ }).max(2048);
const priceMinor = z.number().int().positive().max(10 ** 12);
export const addItemRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('single'), title: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(99).default(1), url: httpsUrl.optional(), priceMinor: priceMinor.optional() }),
  z.object({ type: z.literal('group'), title: z.string().trim().min(1).max(120), url: httpsUrl.optional(), priceMinor }),
]);
export const addItemResponseSchema = z.object({ itemId: z.string() });
// AddItem
execute(input: { wishlistId: string } & AddItemRequest, access: AccessContext): Promise<{ itemId: string }>
```

  Route: `POST /api/lists/:slug/items`, operationId `addItem`. It answers 201, 400, 404 (no list, or no owner cookie for this list) and 409 (`no_payment_method`).

- [ ] **Step 1: Write the failing use-case tests** (in-memory):
  - The owner adds a single; it persists, with stream seq 0.
  - Without `access.owner`, it throws `WishlistNotFoundError` and persists nothing.

  The group payment-method rule is already pinned in the domain. Don't repeat it here.
- [ ] **Step 2: Implement `AddItem`.** Steps:
  1. If `!access.owner`, throw `WishlistNotFoundError(input.wishlistId)`, with a comment that it's the same as no list (ADR-0016).
  2. Inside the unit of work, `findById(id, clock.now())`. If null, throw `WishlistNotFoundError`.
  3. `const item = wishlist.addItem(props, tokenGenerator)`.
  4. `await ctx.wishlists.insertItem(item)`, then return `{ itemId }`.
- [ ] **Step 3: Write the failing route tests:**
  - **Success:** create a list, POST owner-session, then POST items with the cookie. Expect 201 with an `itemId`.
  - **Security matrix:** no cookie, a guest cookie only, and an owner cookie from **another** list. Each gives 404 `Not found`.
  - **Schema boundary:** `url: 'javascript:alert(1)'` gives 400.
  - **Error mapping reached:** a group on a list without handles gives 409 `no_payment_method`.
- [ ] **Step 3a: Add the `ownerAccess` helper** in `routes.ts`, copying `guestAccess`:

```ts
async function ownerAccess(request: FastifyRequest, slug: string): Promise<{ wishlist: Wishlist; access: AccessContext } | null> {
  const owner = readOwnerSession(request);
  if (!owner) return null;
  const wishlist = await deps.wishlists.findBySlug(slug, deps.clock.now());
  if (!wishlist) return null;
  const access = accessContextFor({ guest: readSignedSession(request), owner }, { id: wishlist.id.value, keyGen: wishlist.keyGen }, deps.hasher);
  return access.owner ? { wishlist, access } : null;
}
```

- [ ] **Step 4: Implement the route and wiring.** Call `sendDomainError` in the catch. Then run `npm run gen:api`.
- [ ] **Step 5: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(api): the owner adds single items and group gifts`.

---

### Task 14: Payment handles at list creation

**Files:**
- Modify: `apps/api/src/application/use-cases/CreateList.ts`
- Modify: `apps/api/src/application/use-cases/CreateList.test.ts`
- Modify: `packages/shared-types/src/createList.ts` (`venmoHandle`, `zelleHandle`: optional strings, max 254)
- Modify: `packages/shared-types/src/createList.test.ts` (only if the existing cases break; otherwise leave it)
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`
- Modify: `apps/web/src/features/create-list/CreateListForm.tsx`
- Modify: `apps/web/src/features/create-list/CreateListForm.test.tsx`

**Interfaces:**
- Produces: `CreateListInput.venmoHandle?: string` and `zelleHandle?: string`. `CreateList` passes `PaymentMethods.from({...})` to `Wishlist.create`. An invalid handle throws `DomainValidationError`, which becomes a 400 with the domain message (Task 12).

- [ ] **Step 1: Write the failing use-case test.** It checks that handles given at creation are stored normalized: create with `venmoHandle: '@my-venmo'`, then load and expect `paymentMethods.venmoHandle === 'my-venmo'`.
- [ ] **Step 2: Implement it.** Then run `npm run gen:api`.
- [ ] **Step 3: Write the failing form tests:**
  - It sends `venmoHandle` and `zelleHandle` when filled (body capture, as in Task 3).
  - It shows the hint text `Group gifts need at least one handle. Handles can't be changed later.`
  - The success screen links to `/abc123/manage`, and the link has no token in its href.
- [ ] **Step 4: Implement the form.** Add two optional inputs labelled `Venmo username` and `Zelle email or US phone`, with that hint as `aria-describedby`. On success, add a `Manage your list` link to `/${data.slug}/manage` and the line "Save your owner token now: you'll need it to manage the list, and it isn't shown again."
- [ ] **Step 5: Run checks.** Run the api and web tests. Expected: PASS.
- [ ] **Step 6: Commit.** `feat: set Venmo and Zelle handles when creating a list`.

---

### Task 15: List view returns `items[]` and `payment`

**Files:**
- Modify: `packages/shared-types/src/listView.ts`
- Modify: `packages/shared-types/src/holdView.test.ts` (its `listViewResponseSchema` block)
- Modify: `apps/api/src/application/use-cases/GetListView.ts`
- Modify: `apps/api/src/application/use-cases/GetListView.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts` (public `availableUnitsOf(itemId)`)
- Modify: `apps/api/src/domain/entities/Wishlist.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces:

```ts
export const listItemSchema = z.object({
  id: z.string(), title: z.string(), type: z.enum(['single', 'group']), status: itemStatusSchema,
  availableUnits: z.number().int().nonnegative(), url: z.string().nullable(), priceMinor: z.number().int().nullable(),
});
// listViewResponseSchema gains:
items: z.array(listItemSchema),
payment: z.object({ venmoHandle: z.string().nullable(), zelleHandle: z.string().nullable() }),
// `item` stays until Task 27.
```

  `Wishlist.availableUnitsOf(itemId: string): number` makes the existing private helper public by item id. It throws `ItemNotFoundError` for another list's item.

- [ ] **Step 1: Write the failing tests:**
  - Domain: `availableUnitsOf` for a quantity-3 single with one active hold gives `2`.
  - Use case: a list with a single (qty 2) and a group returns both in `items`, in order, with `availableUnits` and `payment` set.
  - Schema: the list view requires `items` and `payment`.
- [ ] **Step 2: Implement.** `GetListView` maps `wishlist.items`. It throws `WishlistNotFoundError` only when the list has no items, keeping today's behaviour. Run `npm run gen:api`.
- [ ] **Step 3: Run checks.** Run the api, shared-types and web tests (web still reads `item`). Expected: PASS. Update the web MSW list bodies only if the generated types make them fail to compile; that may push the count to 10.
- [ ] **Step 4: Commit.** `feat(api): list every item, its units left and the payment handles`.

---

### Task 16: Guest cards for many items

**Files:**
- Modify: `apps/web/src/pages/ListPage.tsx`
- Modify: `apps/web/src/pages/ListPage.test.tsx`
- Modify: `apps/web/src/features/holds/ItemView.tsx`
- Modify: `apps/web/src/features/holds/ItemView.test.tsx`
- Create: `apps/web/src/lib/formatMoney.ts`
- Modify: `e2e/guest-manages-a-hold.spec.ts` (only if the heading or text it reads moved)

**Interfaces:**
- Produces:
  - `ItemView` takes `item: ListViewResponse['items'][number]` and drops `listTitle`. `ListPage` renders the `<h1>` with the list title, then one `ItemView` per item in a single-column list (`<ul>`/`<li>`).
  - `formatMoney(minor: number): string`, built on `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` with `minor / 100`.
  - The card shows:
    - the title, as `<h2>`;
    - the price when set;
    - a `View in store` link when `url` is set (`target="_blank" rel="noopener noreferrer"`);
    - for singles, `N left`, plus the existing Hold button and dialog when the status is `available`;
    - for groups, the price only. Task 29 adds pledging.

- [ ] **Step 1: Write the failing component tests:**
  - It renders the price formatted (`$450.00`).
  - It shows the store link only for an https `url` and the units left for a single.
  - A group card has no Hold button.

  The ListPage test checks that two items render two cards and that `YourHolds` gets titles for both.
- [ ] **Step 2: Implement.** Focus handling after a hold stays as it is, per card. `focusElsewhere` still targets `#your-holds-heading`. `YourHolds` gets `itemTitles` from `Object.fromEntries(items.map(i => [i.id, i.title]))`.
- [ ] **Step 3: Run checks.** Run the web tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(web): show every item on the list as a card`.

---

### Task 17: Manage page — owner token gate and add-item form

**Files:**
- Modify: `apps/web/src/App.tsx` (route `/:slug/manage`)
- Create: `apps/web/src/pages/ManagePage.tsx`
- Create: `apps/web/src/features/manage/OwnerTokenGate.tsx`
- Create: `apps/web/src/features/manage/OwnerTokenGate.test.tsx`
- Create: `apps/web/src/features/manage/AddItemForm.tsx`
- Create: `apps/web/src/features/manage/AddItemForm.test.tsx`
- Modify: `apps/web/src/api/client.ts` (`enterOwnerToken`, `addItem`)
- Create: `e2e/owner-adds-items.spec.ts`

**Interfaces:**
- Consumes: `POST /api/lists/{slug}/owner-session` (Task 6) and `POST /api/lists/{slug}/items` (Task 13).
- Produces:
  - `api.enterOwnerToken(slug, { ownerToken })` and `api.addItem(slug, AddItemRequest)`.
  - `ManagePage` shows `OwnerTokenGate` until it succeeds, then `AddItemForm`. The token lives only in the input's state and is never stored. If `addItem` answers 404, the page returns to the gate with "Enter your owner token again."

- [ ] **Step 1: Write the failing `OwnerTokenGate` test.** It submits the token and calls `onSuccess`. A 404 shows `That token doesn't match this list.` in a `role="alert"`. The input is `type="password"`.
- [ ] **Step 2: Write the failing `AddItemForm` tests:**
  - Defaults to `Single item` with fields Title, Quantity, Price (USD) and Store link.
  - Choosing `Group gift` hides Quantity and makes Price required.
  - It submits `{ type, title, quantity, url?, priceMinor? }`, with the price parsed from dollars to cents. Reuse the parser from Task 29 if it exists; otherwise create `apps/web/src/lib/parseUsd.ts` now and let Task 29 reuse it. That makes 9 files.
  - It shows the server's 409 message (`no_payment_method`) and 400 message in `role="alert"`. The group option is never disabled: the page loads no list data, so the server decides (spec, Web).
  - On success it clears the form and announces `Added "Crib".` in an `aria-live="polite"` region.
- [ ] **Step 3: Implement** the client calls, the components, the page and the route.
- [ ] **Step 4: Write the e2e** `owner-adds-items.spec.ts`:
  1. Create a list with secret `e2e-create-secret` and Venmo `my-venmo`, and read the owner token.
  2. Open `Manage your list` and enter the token.
  3. Add `Crib` (single, qty 2, $199.99, `https://shop.example/crib`) and `Stand mixer` (group, $450).
  4. Run an axe scan (copy the helper from the existing spec).
  5. Open the guest link in a new page with the key. Expect cards `Crib` (`2 left`, `$199.99`, `View in store`) and `Stand mixer` (`$450.00`), plus the existing first item.

  Use a 375 px viewport in this spec: `test.use({ viewport: { width: 375, height: 812 } })`.
- [ ] **Step 5: Run checks.** Run the web tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(web): a manage page where the owner adds items`.

---

### Task 18: Holder details in the hold domain

**Files:**
- Create: `apps/api/src/domain/value-objects/GuestDetails.ts`
- Create: `apps/api/src/domain/value-objects/GuestDetails.test.ts`
- Modify: `apps/api/src/domain/entities/Hold.ts` (`piiRef: UuidId | null`)
- Modify: `apps/api/src/domain/entities/Item.ts` (`placeHold` props `piiRef?: string`, into the hold and the event)
- Modify: `apps/api/src/domain/entities/Item.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts` (`holdItem` passes `piiRef`)
- Modify: `apps/api/src/domain/events/ItemHeldEvent.ts` (`piiRef: string | null`)

**Interfaces:**
- Produces:

```ts
export class GuestDetails {
  /** name: trimmed, 1–100 chars; message: trimmed, ≤ 300 chars, blank → null. Throws DomainValidationError ("Name …" / "Message …"). */
  static from(props: { name: string; message?: string | null }): GuestDetails;
  readonly name: string; readonly message: string | null;
}
// Hold.create / reconstitute props gain `piiRef?: string | null` (default null); getter `piiRef: string | null`.
// ItemHeldEvent gains `piiRef: string | null`, set by placeHold.
```

  It's optional now so existing fixtures stay untouched. Task 25 makes the route require a name, so every new hold has one.

- [ ] **Step 1: Write the failing tests.**
  - `GuestDetails`: trims; refuses an empty or blank name and a name over 100; turns a blank message into null; refuses a message over 300.
  - `Item.test`: "placeHold records the piiRef on the hold and on ItemHeld". Also check that `ItemHeld` holds no `name` or `message` key: `expect(event).not.toHaveProperty('name')`, and the same for `message`.
- [ ] **Step 2: Implement.** The `ItemHeldEvent` doc comment says PII lives in `guest_pii`, referenced by `piiRef` (ADR-0057).
- [ ] **Step 3: Run checks.** Run the api tests. Expected: PASS. If `anItemHeldEvent` in `builders.ts` fails to typecheck, add `piiRef: null`; that makes 8 files.
- [ ] **Step 4: Commit.** `feat(api): holds reference the holder's details by piiRef`.

---

### Task 19: `holds.pii_ref` persistence and rebuild

**Files:**
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts` (`holds.pii_ref text null references guest_pii(id)`)
- Modify: `apps/api/src/infrastructure/db/schema.ts`
- Modify: `apps/api/src/infrastructure/HoldRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts` (`copyHold`)
- Modify: `apps/api/src/application/ports/contracts/holdRepository.contract.ts`
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.ts`
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.integration.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - Contract: "round-trips a hold's piiRef". Insert a `guest_pii` row first through `fx` if the FK requires it. If the fixture can't reach `guestPii`, use a null piiRef in the other tests and seed the row with raw SQL in this one.
  - Rebuild: "re-folds piiRef from ItemHeld and leaves guest_pii untouched".
- [ ] **Step 2: Implement** the column, the mapping and `ItemHeld` folding `pii_ref: event.piiRef ?? null`.
- [ ] **Step 3: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): persist and rebuild a hold's piiRef`.

---

### Task 20: Hold accepts optional `name`/`message`

**Files:**
- Modify: `packages/shared-types/src/holdItem.ts` (`name: z.string().trim().min(1).max(100).optional()`, `message: z.string().max(300).optional()`)
- Modify: `apps/api/src/application/use-cases/HoldItem.ts`
- Modify: `apps/api/src/application/use-cases/HoldItem.test.ts`
- Modify: `apps/api/src/presentation/routes.ts` (pass `name`/`message`)
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces: `HoldItemInput.name?: string` and `message?: string`. With a name, `HoldItem` validates `GuestDetails.from`, inserts a `guest_pii` row (`id = tokenGenerator.generateEntityId()`) in the same unit of work, and passes `piiRef` to `wishlist.holdItem`. It doesn't insert on replay.

- [ ] **Step 1: Write the failing use-case tests:**
  - A hold with a name stores the details and references them: `store.guestPii` has the row, and the hold's and event's `piiRef` equal its id.
  - A replayed key creates no second `guest_pii` row.
- [ ] **Step 2: Implement.** Order the work so the `guest_pii` insert precedes the hold insert (foreign key). Run `npm run gen:api`.
- [ ] **Step 3: Run checks.** Run the api tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): a hold may carry the holder's name and message`.

---

### Task 21: Hold dialog asks for name and message

**Files:**
- Modify: `apps/web/src/features/holds/HoldDialog.tsx`
- Modify: `apps/web/src/features/holds/HoldDialog.test.tsx`
- Modify: `apps/web/src/features/holds/ItemView.tsx` (forward `name`/`message` to `mutate`)
- Modify: `e2e/guest-manages-a-hold.spec.ts` (fill `Your name`)

**Interfaces:**
- Produces: `HoldDialogProps.onConfirm(credential, details: { name: string; message: string })`. The fields are:
  - `Your name` (required, maxLength 100).
  - `Message to the owner (optional)` (`<textarea>`, maxLength 300).
  - The static line "Your name is only shared with the list owner."

- [ ] **Step 1: Write the failing tests.** Confirm is disabled until a non-blank name is typed, and `onConfirm` receives the trimmed name and message.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run checks.** Run the web tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(web): ask the holder's name and an optional message`.

---

### Task 22: Contribution domain

**Files:**
- Create: `apps/api/src/domain/value-objects/Money.ts`
- Create: `apps/api/src/domain/value-objects/Money.test.ts`
- Create: `apps/api/src/domain/entities/Contribution.ts`
- Create: `apps/api/src/domain/events/ContributionPledgedEvent.ts`
- Modify: `apps/api/src/domain/entities/Item.ts` (`pledge`; move `MAX_MONEY_MINOR` to `Money.ts`)
- Modify: `apps/api/src/domain/entities/Item.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts` (`pledge`)
- Modify: `apps/api/src/domain/errors.ts` (`ContributionAmountError`)

**Interfaces:**
- Produces:

```ts
// Money.ts
export const MAX_MONEY_MINOR = 10 ** 12; // ADR-0061: keeps sums in safe-integer range
export class Money {
  static usd(amountMinor: number): Money; // safe integer, 1..MAX_MONEY_MINOR, else DomainValidationError
  readonly amountMinor: number; readonly currency: 'USD';
}
// Contribution.ts — own aggregate, referenced by itemId
export class Contribution {
  static create(props: { id; itemId; amount: Money; sessionHash; idempotencyKey; piiRef; pledgedAt: Date }): Contribution;
  static reconstitute(props: { id; itemId; amountMinor: number; sessionHash; idempotencyKey; piiRef; pledgedAt: Date }): Contribution;
  readonly id: UuidId; readonly itemId: UuidId; readonly amount: Money; readonly sessionHash: SessionHash;
  readonly idempotencyKey: IdempotencyKey; readonly piiRef: UuidId; readonly pledgedAt: Date;
  belongsToSession(sessionHash: string): boolean;
}
// ContributionPledgedEvent.ts
export interface ContributionPledgedEvent { type: 'ContributionPledged'; v: 1; itemId; contributionId; amountMinor: number; sessionHash; idempotencyKey; piiRef; occurredAt: string }
// errors.ts
export class ContributionAmountError extends Error { constructor(itemId: string) { super(`Contribution amount out of range for item ${itemId}`); } }
// Item
export const MAX_CONTRIBUTION_TARGET_MULTIPLE = 5; // shortcut: constant, not the MAX_CONTRIBUTION_TARGET_MULTIPLE env var; add the env var when an operator needs another value
pledge(props: { amountMinor: number; sessionHash; idempotencyKey; piiRef; at: Date }, ids: { generateEntityId(): string }): { contribution: Contribution; event: ContributionPledgedEvent; expectedSeq: number }
// Wishlist
pledge(props: { itemId; amountMinor; sessionHash; idempotencyKey; piiRef }, ids): { contribution; item; event; expectedSeq }  // getItem, then item.pledge({...props, at: this.asOf})
```

  `ContributionPledgedEvent` is **not** in `LedgerEvent` yet; Task 24 adds it.

- [ ] **Step 1: Write the failing tests:**

```ts
// Money.test.ts
it.each([0, -1, 1.5, 10 ** 12 + 1, Number.NaN])('refuses %j', (v) => expect(() => Money.usd(v)).toThrow(DomainValidationError));
it('keeps a valid amount', () => expect(Money.usd(2500).amountMinor).toBe(2500));

// Item.test.ts
describe('pledge', () => {
  const group = () => Item.createGroup({ id: ID, wishlistId: WL, title: 'Mixer', priceMinor: 45000 });
  const props = { sessionHash: 'a'.repeat(64), idempotencyKey: 'k1', piiRef: PII, at: AT };
  it('records the pledge and advances the stream', () => {
    const item = group();
    const { contribution, event, expectedSeq } = item.pledge({ ...props, amountMinor: 11250 }, { generateEntityId: () => CID });
    expect([contribution.amount.amountMinor, event.type, event.amountMinor, expectedSeq, item.seq]).toEqual([11250, 'ContributionPledged', 11250, 0, 1]);
    expect(event).not.toHaveProperty('name');
    expect(event).not.toHaveProperty('message');
  });
  it('allows overfunding up to five times the price', () => {
    expect(() => group().pledge({ ...props, amountMinor: 45000 * 5 }, ids)).not.toThrow();
  });
  it.each([0, -100, 12.5, 45000 * 5 + 1])('refuses amount %j', (amountMinor) => {
    expect(() => group().pledge({ ...props, amountMinor }, ids)).toThrow(ContributionAmountError);
  });
  it('refuses a pledge on a single item', () => {
    const single = Item.createSingle({ id: ID, wishlistId: WL, title: 'Crib' });
    expect(() => single.pledge({ ...props, amountMinor: 100 }, ids)).toThrow(ItemUnavailableError);
  });
});
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `Item.pledge`:
  1. If the item isn't a group, throw `ItemUnavailableError`.
  2. If the amount isn't a safe integer, is ≤ 0, or exceeds `priceMinor × MAX_CONTRIBUTION_TARGET_MULTIPLE` or `MAX_MONEY_MINOR`, throw `ContributionAmountError`.
  3. Build the `Contribution` with `Money.usd`, build the event, and return `expectedSeq: this.recordEvent()`.

  `Wishlist.pledge` takes no extra rule. Its existing `getItem` authorization test already covers another list's item, so give it no new test.
- [ ] **Step 4: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): pledges toward group gifts in the domain`.

---

### Task 23: `contributions` store

**Files:**
- Modify: `apps/api/src/infrastructure/db/migrations/0001_init.ts`
- Modify: `apps/api/src/infrastructure/db/schema.ts`
- Create: `apps/api/src/application/ports/ContributionRepository.ts`
- Modify: `apps/api/src/application/ports/UnitOfWork.ts`
- Modify: `apps/api/src/infrastructure/UnitOfWorkKysely.ts`
- Create: `apps/api/src/infrastructure/ContributionRepositoryKysely.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.ts`
- Create: `apps/api/src/application/ports/contracts/contributionRepository.contract.ts`
- Modify: `apps/api/src/infrastructure/contracts.integration.test.ts`
- Modify: `apps/api/src/application/test-fakes/InMemoryRepositories.contract.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ContributionRepository {
  insert(contribution: Contribution): Promise<void>;
  findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Contribution | null>;
  /** Sum of pledged amounts per item on the list; items with none are absent. Computed from the rows, never stored (D21). */
  pledgedTotals(wishlistId: string): Promise<Map<string, number>>;
}
// TransactionContext gains: contributions: ContributionRepository
```

  Table: `contributions (id pk, item_id not null references items(id), amount_minor integer not null CHECK (amount_minor > 0), session_hash not null, idempotency_key not null, pii_ref not null references guest_pii(id), pledged_at not null, created_at not null, UNIQUE (item_id, idempotency_key))`, plus an index on `item_id`.

- [ ] **Step 1: Write the contract tests:**
  - Insert and find by key.
  - A duplicate `(item, key)` throws.
  - `pledgedTotals` sums per item and leaves out other lists.
- [ ] **Step 2: Implement** the table, the adapter, the fake and the wiring. `pledgedTotals` uses `select item_id, sum(amount_minor)` joined to `items where wishlist_id = ?`, grouped by `item_id`.
- [ ] **Step 3: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): store contributions and sum them per item`.

---

### Task 24: `ContributionPledged` joins the ledger

**Files:**
- Modify: `apps/api/src/domain/events/LedgerEvent.ts`
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.ts` (truncate and re-fold `contributions`)
- Modify: `apps/api/src/infrastructure/projections/rebuildProjections.integration.test.ts`
- Modify: `apps/api/src/presentation/ledgerActors.integration.test.ts` (`ContributionPledged: ['guest']`)

- [ ] **Step 1: Write the failing rebuild test.** Re-folding a `ContributionPledged` event gives the same `contributions` row as the incremental write, and `guest_pii` is left untouched.
- [ ] **Step 2: Implement.** Add the type to the union, and handle `case 'ContributionPledged'` in the rebuild switch, inserting the row from the payload.
- [ ] **Step 3: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): contributions are rebuilt from the ledger`.

---

### Task 25: `name` required on holds

**Files:**
- Modify: `packages/shared-types/src/holdItem.ts` (`name` required)
- Modify: `apps/api/src/application/use-cases/HoldItem.ts` (`name: string`; always insert the details)
- Modify: `apps/api/src/application/use-cases/HoldItem.test.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify: `apps/api/src/presentation/concurrency.integration.test.ts`
- Modify: `apps/api/src/presentation/ledgerActors.integration.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

- [ ] **Step 1: Update the tests.** Every hold request sends `name: 'Ada'`. Add one route test: a hold without `name` is 400.
- [ ] **Step 2: Implement.** Make the field required and remove the optional branch in `HoldItem`. Run `npm run gen:api`.
- [ ] **Step 3: Run checks.** Run the api tests, the web tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): a hold always records the holder's name`.

---

### Task 26: `PledgeContribution` use case and route

**Files:**
- Create: `apps/api/src/application/use-cases/PledgeContribution.ts`
- Create: `apps/api/src/application/use-cases/PledgeContribution.test.ts`
- Create: `packages/shared-types/src/pledge.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/api/src/presentation/compositionRoot.ts`
- Modify: `apps/api/src/presentation/routes.ts`
- Modify: `apps/api/src/presentation/routes.integration.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

**Interfaces:**
- Produces:

```ts
export const pledgeRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1),
  amountMinor: z.number().int(),          // bounds are the domain's; out-of-range is a 409, not a 400
  name: z.string().trim().min(1).max(100),
  message: z.string().max(300).optional(),
});
export const pledgeResponseSchema = z.object({ contributionId: z.string(), itemId: z.string(), amountMinor: z.number().int() });
// PledgeContribution.execute(input: { wishlistId; itemId } & PledgeRequest, access): Promise<PledgeResponse>
```

  Route: `POST /api/lists/:slug/items/:itemId/contributions`, operationId `pledgeContribution`. It answers 201 (a replay too, mirroring `holdItem`), 400, 404 and 409.

- [ ] **Step 1: Write the failing use-case tests:**
  - A guest pledge stores the contribution, its details row and the event, with actor `guest`.
  - Replaying the same key from the same session returns the original and adds no rows.
  - The same key from another session is refused as `ItemUnavailableError`, with nothing written.
  - Without a guest session it throws `ItemNotFoundError`.
- [ ] **Step 2: Implement.** Copy `HoldItem.execute`'s order:
  1. Check access.
  2. Load the wishlist at `clock.now()`, and `getItem`.
  3. Look up the replay with `ctx.contributions.findByIdempotencyKey`, checking `belongsToSession`.
  4. `GuestDetails.from`, then `ctx.guestPii.insert`.
  5. `wishlist.pledge`.
  6. `eventStore.append(..., 'guest')`.
  7. `ctx.contributions.insert`, then `ctx.wishlists.saveItemState(item)`.
- [ ] **Step 3: Write the failing route tests.** A guest pledge gives 201. Without a session it's 404. Another list's item is 404. A single item gives 409 `item_unavailable`, which shows the error mapping is reached.
- [ ] **Step 4: Implement the route and wiring.** Then run `npm run gen:api`.
- [ ] **Step 5: Run checks.** Run the api tests. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(api): guests pledge toward group gifts`.

---

### Task 27: List view shows pledged totals; drop `item`

**Files:**
- Modify: `packages/shared-types/src/listView.ts` (`pledgedMinor: z.number().int().nonnegative().nullable()` on items, null for singles; remove `item`)
- Modify: `packages/shared-types/src/holdView.test.ts`
- Modify: `apps/api/src/application/use-cases/GetListView.ts`
- Modify: `apps/api/src/application/use-cases/GetListView.test.ts`
- Modify: `apps/api/src/domain/entities/Wishlist.ts` (remove `get item()`)
- Modify: `apps/api/src/domain/entities/Wishlist.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`
- Modify: web test fixtures that still send `item`, if any (`ListPage.test.tsx`)

- [ ] **Step 1: Write the failing use-case test.** A group with pledges of 11250 and 5000 reports `pledgedMinor: 16250`, and a single reports `null`.
- [ ] **Step 2: Implement.** Call `ctx.contributions.pledgedTotals(wishlist.id.value)` once. Remove `item` from the schema and the use case, and remove the getter and any test that used it. Run `npm run gen:api`.
- [ ] **Step 3: Run checks.** Run all tests. Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): list views carry pledged totals`.

---

### Task 28: 409 `amount_out_of_range`

**Files:**
- Modify: `packages/shared-types/src/errorResponse.ts`
- Modify: `apps/api/src/presentation/domainErrorResponse.ts`
- Modify: `apps/api/src/presentation/domainErrorResponse.test.ts`
- Modify: `apps/api/openapi.json`, `apps/web/src/api/schema.gen.ts`

- [ ] **Step 1: Add the table row** `ContributionAmountError → 409 { message: 'That amount is more than this gift can take. Try a smaller amount.', code: 'amount_out_of_range' }`. Expected: FAIL.
- [ ] **Step 2: Implement it.** Then run `npm run gen:api`.
- [ ] **Step 3: Run checks.** Expected: PASS.
- [ ] **Step 4: Commit.** `feat(api): explain an out-of-range pledge`.

Ordering note: this task only needs Task 22's error, so it may move earlier if a stack slot is free.

---

### Task 29: Web contribute flow

**Files:**
- Create: `apps/web/src/lib/parseUsd.ts` (unless Task 17 created it)
- Create: `apps/web/src/lib/parseUsd.test.ts`
- Create: `apps/web/src/features/contribute/paymentLinks.ts`
- Create: `apps/web/src/features/contribute/ContributeDialog.tsx`
- Create: `apps/web/src/features/contribute/ContributeDialog.test.tsx`
- Modify: `apps/web/src/api/client.ts` (`pledgeContribution`)
- Modify: `apps/web/src/features/holds/ItemView.tsx` (group card: progress and `Chip in`)
- Modify: `apps/web/src/features/holds/ItemView.test.tsx`
- Create: `e2e/guest-pledges.spec.ts`

**Interfaces:**
- Produces:

```ts
/** "$1,250.50" / "1250.5" / "50" → cents; null for anything else (blank, ≤ 0, > 2 decimals, letters). */
export function parseUsd(input: string): number | null;
export function venmoAppLink(handle: string, amountMinor: number, note: string): string;
// `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${(amountMinor / 100).toFixed(2)}&note=${encodeURIComponent(note)}`
export function venmoWebLink(handle: string): string; // `https://account.venmo.com/u/${encodeURIComponent(handle)}`
```

  These two templates are the only payment hrefs the app ever renders (spec payments rule). The handle was validated at creation.

- [ ] **Step 1: Write the failing `parseUsd` tests:**

```ts
it.each([['50', 5000], ['$50', 5000], ['50.5', 5050], ['1,250.00', 125000], [' 12.34 ', 1234]])('%j → %j', (input, cents) => expect(parseUsd(input)).toBe(cents));
it.each(['', '0', '0.00', '-5', '50.555', 'abc', '1,2,3', '$', '1e3'])('%j → null', (input) => expect(parseUsd(input)).toBeNull());
```

  Implementation: trim, strip one leading `$`, and require `/^(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/`. Remove the commas, split on `.`, and compute integer cents without floats: `whole * 100 + Number(frac.padEnd(2, '0'))`. Return null when the result is 0.
- [ ] **Step 2: Write the failing `ContributeDialog` tests.** The dialog is a native `<dialog>` in the `HoldDialog` style, with the idempotency key minted once at open via `useState(() => crypto.randomUUID())`.
  - **Step 1 of the flow:** a `Cover the rest ($X)` choice when the remainder is > 0, and a `Another amount` text field. `Continue` is disabled until there's a valid amount; an invalid entry shows `Enter an amount like 25 or 25.50.`
  - **Step 2 of the flow:**
    - `Pay $X with Venmo`, linking to `venmoAppLink`, plus `Venmo website` linking to `venmoWebLink`, when there's a Venmo handle.
    - `Zelle: <handle>` with a `Copy` button (`navigator.clipboard.writeText`, then announce `Copied.`), when there's a Zelle handle.
    - The amount (editable, prefilled), `Your name` (required) and `Message to the owner (optional)`.
    - `I've sent it`, disabled while pending.
  - **Server errors** (409 `amount_out_of_range`, `item_unavailable`) show in `role="alert"`. Success closes the dialog and announces `Thank you! Your pledge of $X is recorded.`
  - **Double tap:** two fast clicks on `I've sent it` send one request (the button is disabled while pending).
- [ ] **Step 3: Write the failing `ItemView` group-card test.** The card shows `<progress max={priceMinor} value={min(pledged, price)}>` labelled `$162.50 of $450.00 pledged · 36%`. A pledged total over the price shows e.g. `$520.00 of $450.00 pledged · 116%`. There's a `Chip in` button. Pass `payment` from `ListPage` into `ItemView`; that change belongs in this task (10 files with `ListPage.tsx`). If over, fold the e2e into `owner-adds-items.spec.ts` as a second test instead of a new file.
- [ ] **Step 4: Implement** the client call, the hook (inline `useMutation` that invalidates the list query, mirroring `useHoldItem`), the dialog and the card.
- [ ] **Step 5: Write the e2e** `guest-pledges.spec.ts` at 375 px:
  1. The owner creates a list with Venmo `my-venmo` and adds group `Stand mixer` ($450) via the manage page.
  2. A guest opens it, taps `Chip in`, picks `Cover the rest ($450.00)` and continues.
  3. The guest sees a `Pay $450.00 with Venmo` link whose href starts `venmo://paycharge`, fills `Your name`, and taps `I've sent it`.
  4. The card reads `$450.00 of $450.00 pledged · 100%`. Run an axe scan.
- [ ] **Step 6: Run checks.** Run the web tests and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 7: Commit.** `feat(web): guests chip in toward group gifts`.

---

## After the last task

- Run the whole-branch review (superpowers:requesting-code-review). Then run the manual go-live checklist from the spec on the home server.
- Update the memory note `launch-cut-2026-10` with what merged.
