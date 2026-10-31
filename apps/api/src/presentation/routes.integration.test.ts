import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { FixedClock } from '../application/test-fakes/FixedClock.js';
import type { Logger } from '../application/ports/Logger.js';
import { buildDependencies, type BuildDependenciesOptions } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';
import { DomainValidationError } from '../domain/errors.js';

function extractCookieHeader(response: LightMyRequestResponse): string {
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(raw).split(';')[0];
}

const guestKey = 'abacus-abdomen-able';
let app: FastifyInstance;
let db: ReturnType<typeof createDb>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  app = buildApp(buildDependencies(db, undefined, { createSecret: 'test-create-secret' }), { cookieSecret: 'test-secret' });
  disposeWithApp(app, db);
});

afterEach(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('answers 200 so a probe can tell the process is up', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});

describe('Content-Security-Policy', () => {
  it('sends the image policy on API responses and the SPA fallback', async () => {
    const webDist = await mkdtemp(path.join(tmpdir(), 'gubbins-web-'));
    onTestFinished(() => rm(webDist, { recursive: true, force: true }));
    await writeFile(path.join(webDist, 'index.html'), '<!doctype html><title>spa</title>');
    const withSpa = buildApp(buildDependencies(db, undefined, {}), { cookieSecret: 'test-secret', webDist });
    onTestFinished(() => withSpa.close());
    for (const url of ['/api/instance', '/wishlists/abc']) {
      const response = await withSpa.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-security-policy']).toBe("img-src 'self'");
    }
  });
});

describe('GET /api/instance', () => {
  it('serves the source URL and privacy contact without a session', async () => {
    const configured = buildApp(buildDependencies(db, undefined, { instance: { sourceUrl: 'https://example.com/src', privacyContact: 'me@example.com' } }), { cookieSecret: 'test-secret' });
    onTestFinished(() => configured.close());
    const response = await configured.inject({ method: 'GET', url: '/api/instance' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sourceUrl: 'https://example.com/src', privacyContact: 'me@example.com' });
  });
});

describe('GET /api/guest-key-suggestion', () => {
  it('sends the suggestion with Cache-Control: no-store', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest-key-suggestion' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('suggests a key the create route accepts', async () => {
    const { key } = (await app.inject({ method: 'GET', url: '/api/guest-key-suggestion' })).json();
    const created = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret', key } });
    expect(created.statusCode).toBe(201);
    expect(created.json().key).toBe(key);
  });
});

describe('POST /api/lists', () => {
  it('creates a list and returns slug/ownerToken/key', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret', key: guestKey } });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toHaveProperty('slug');
    expect(body).toHaveProperty('ownerToken');
    expect(body).toHaveProperty('key');
  });

  it('refuses a wrong create secret with 403', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'wrong', key: guestKey } });
    expect(response.statusCode).toBe(403);
  });

  it.each([
    ['an empty title', { listTitle: '', key: guestKey }, { code: 'too_small', path: ['listTitle'] }],
    ['no key', { listTitle: 'Baby Shower', createSecret: 'test-create-secret' }, { code: 'invalid_type', path: ['key'] }],
  ])('keeps the 400 body shape for %s: message plus zod-style issues', async (_name, payload, issue) => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Invalid request',
      issues: [{ ...issue, message: expect.any(String) }],
    });
  });

  it('refuses a body over 1 MiB, though each field is valid and the extra one would be ignored', async () => {
    const payload = { listTitle: 'L', createSecret: 'test-create-secret', key: guestKey, padding: 'a'.repeat(1024 * 1024) };
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: 'Invalid request' });
  });

  it('returns the same 400 shape when the body is missing', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'Invalid request' });
  });

  it('ignores unknown extra fields in the body', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret', key: guestKey, admin: true } });
    expect(response.statusCode).toBe(201);
  });
});

/** A list holding one single item, Stroller, added by its owner. */
async function createList(on: FastifyInstance = app) {
  const list = (await on.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret', key: guestKey } }))
    .json() as { slug: string; ownerToken: string; key: string };
  const owner = extractCookieHeader(await on.inject({ method: 'POST', url: `/api/lists/${list.slug}/owner-session`, payload: { ownerToken: list.ownerToken } }));
  const added = await on.inject({ method: 'POST', url: `/api/lists/${list.slug}/items`, headers: { cookie: owner }, payload: { type: 'single', title: 'Stroller' } });
  return { ...list, itemId: (added.json() as { itemId: string }).itemId };
}

const DAY = 24 * 60 * 60 * 1000;

async function guestOn(list: { slug: string; key: string }, on: FastifyInstance = app): Promise<string> {
  return extractCookieHeader(await on.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } }));
}

async function ownerOn(list: { slug: string; ownerToken: string }, on: FastifyInstance = app): Promise<string> {
  return extractCookieHeader(await on.inject({ method: 'POST', url: `/api/lists/${list.slug}/owner-session`, payload: { ownerToken: list.ownerToken } }));
}

function holdAction(slug: string, holdId: string, action: 'extend' | 'release' | 'purchase', cookie?: string, on: FastifyInstance = app) {
  return on.inject({ method: 'POST', url: `/api/lists/${slug}/holds/${holdId}/${action}`, headers: cookie ? { cookie } : {} });
}

async function heldByGuest(on: FastifyInstance = app) {
  const list = await createList(on);
  const cookie = await guestOn(list, on);
  const response = await on.inject({
    method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-1', name: 'Ada' },
  });
  return { list, cookie, response, holdId: (response.json() as { holdId: string }).holdId };
}

/** An app on its own database whose clock the test steps, for expiry. */
async function appAt(start: Date, options: Omit<BuildDependenciesOptions, 'clock'> = {}) {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  const clock = new FixedClock(start);
  const timed = buildApp(buildDependencies(db, undefined, { ...options, clock, createSecret: 'test-create-secret' }), { cookieSecret: 'test-secret' });
  disposeWithApp(timed, db);
  onTestFinished(() => timed.close());
  return { timed, clock };
}

describe('POST /api/lists/:slug/session', () => {
  it('sets a session cookie for the correct key', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    expect(response.statusCode).toBe(200);
    expect(response.cookies).toEqual([expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'Strict' })]);
  });

  it('keeps a guest session cookie for 30 days (Max-Age=2592000)', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    expect(response.headers['set-cookie']).toContain('Max-Age=2592000');
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

describe('POST /api/lists/:slug/owner-session', () => {
  it('sets a signed owner cookie for the correct token', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/owner-session`, payload: { ownerToken: list.ownerToken } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    const [owner] = response.cookies;
    expect(owner).toMatchObject({ name: 'gubbins_owner', httpOnly: true, secure: true, sameSite: 'Strict' });
    expect(JSON.parse(app.unsignCookie(owner.value).value!)).toEqual({ wishlistId: expect.any(String) });
  });

  it('gives the owner cookie no Max-Age, so it ends with the browser session', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/owner-session`, payload: { ownerToken: list.ownerToken } });
    expect(response.headers['set-cookie']).toEqual(expect.any(String));
    expect(response.headers['set-cookie']).not.toContain('Max-Age');
  });

  it('answers a wrong token with a 404 and no cookie', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/owner-session`, payload: { ownerToken: 'wrong-token' } });
    expect(response.statusCode).toBe(404);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

describe('GET /api/lists/:slug', () => {
  it('returns the list view for a valid session, with the item available', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const response = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      title: 'Baby Shower', description: null,
      items: [{ id: list.itemId, title: 'Stroller', type: 'single', status: 'available', availableUnits: 1, url: null, description: null, priceMinor: null, pledgedMinor: null }],
      payment: { venmoHandle: null, zelleHandle: null },
      myHolds: [],
      capabilities: { holdDurationDays: 3 },
    });
  });
});

describe('POST /api/lists/:slug/items/:itemId/hold', () => {
  it('holds the item and the follow-up GET reflects held status', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const holdResponse = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1', name: 'Ada' },
    });
    expect(holdResponse.statusCode).toBe(201);
    expect(holdResponse.json()).toMatchObject({ itemId: list.itemId });

    const viewResponse = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } });
    expect(viewResponse.json()).toMatchObject({ items: [{ status: 'held' }] });
  });

  it('passes the name and message from the body to the hold', async () => {
    const list = await createList();
    const cookie = extractCookieHeader(await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } }));

    await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1', name: 'Ada', message: 'Congrats' },
    });

    expect(await db.selectFrom('guest_pii').select(['name', 'message']).execute()).toEqual([{ name: 'Ada', message: 'Congrats' }]);
  });

  it('returns 409 for a second hold attempt on an already-held item', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);
    await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-1', name: 'Ada' } });

    const second = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-2', name: 'Ada' } });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ message: 'This item is no longer available.', code: 'item_unavailable' });
  });

  it('returns 400 for a hold without a name', async () => {
    const list = await createList();
    const cookie = await guestOn(list);

    const response = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
    });

    expect(response.statusCode).toBe(400);
  });
});

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

    const response = await brokenApp.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret', key: guestKey } });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: 'Internal server error' });
    expect(errors).toContain('response_schema_mismatch');
  });

  it('names the offending field in the log, without echoing its value', async () => {
    const db = createDb(':memory:');
    await migrateToLatest(db);
    const logged: { message: string; meta?: Record<string, unknown> }[] = [];
    const logger: Logger = { logInfo: () => {}, logWarn: () => {}, logError: (message, meta) => { logged.push({ message, meta }); } };
    const deps = buildDependencies(db, logger);
    const brokenCreateList = { execute: async () => ({ slug: 42 }) };
    const brokenApp = buildApp({ ...deps, createList: brokenCreateList as unknown as typeof deps.createList }, { cookieSecret: 'test-secret' });
    disposeWithApp(brokenApp, db);
    onTestFinished(() => brokenApp.close());

    await brokenApp.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret', key: guestKey } });

    const entry = logged.find((l) => l.message === 'response_schema_mismatch');
    expect(entry?.meta?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['slug'], code: 'invalid_type' })]));
    expect(JSON.stringify(entry?.meta)).not.toContain('42');
  });
});

describe('domain validation', () => {
  it('answers a rule the request schema cannot see with 400 and logs a warning', async () => {
    const db = createDb(':memory:');
    await migrateToLatest(db);
    const warnings: string[] = [];
    const logger: Logger = { logInfo: () => {}, logWarn: (message) => { warnings.push(message); }, logError: () => {} };
    const deps = buildDependencies(db, logger);
    const refusingCreateList = { execute: async () => { throw new DomainValidationError('Venmo handle is invalid'); } };
    const refusingApp = buildApp({ ...deps, createList: refusingCreateList as unknown as typeof deps.createList }, { cookieSecret: 'test-secret' });
    disposeWithApp(refusingApp, db);
    onTestFinished(() => refusingApp.close());

    const response = await refusingApp.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret', key: guestKey } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: 'Venmo handle is invalid' });
    expect(warnings).toEqual(['domain_validation_rejected']);
  });
});

describe('requests Fastify rejects before validation', () => {
  async function appWithCapturedErrors() {
    const db = createDb(':memory:');
    await migrateToLatest(db);
    const errors: string[] = [];
    const logger: Logger = { logInfo: () => {}, logWarn: () => {}, logError: (message) => { errors.push(message); } };
    const capturingApp = buildApp(buildDependencies(db, logger), { cookieSecret: 'test-secret' });
    disposeWithApp(capturingApp, db);
    onTestFinished(() => capturingApp.close());
    return { capturingApp, errors };
  }

  it.each([
    ['syntactically invalid JSON', 'application/json', '{"listTitle": "x", '],
    ['an empty body declared as JSON', 'application/json', ''],
    ['an unsupported content type', 'application/x-www-form-urlencoded', 'listTitle=x'],
  ])('answers %s with the 400 Invalid request body and logs no unhandled error', async (_name, contentType, payload) => {
    const { capturingApp, errors } = await appWithCapturedErrors();

    const response = await capturingApp.inject({ method: 'POST', url: '/api/lists', headers: { 'content-type': contentType }, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'Invalid request' });
    expect(errors).toEqual([]);
  });
});

describe('root-level validation issues', () => {
  it('reports an empty path, as zod does, when the body itself is the wrong type', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/lists', headers: { 'content-type': 'application/json' }, payload: 'null' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Invalid request',
      issues: [{ code: 'invalid_type', path: [], message: expect.any(String) }],
    });
  });
});

describe('hold lifecycle over HTTP', () => {
  it("answers the generic 404 when asked to hold another list's item", async () => {
    const list = await createList();
    const other = await createList();
    const cookie = await guestOn(list);

    const response = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${other.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-x', name: 'Ada' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });

  it('extends once, then answers 409 hold_already_extended', async () => {
    const { list, cookie, holdId } = await heldByGuest();

    const first = await holdAction(list.slug, holdId, 'extend', cookie);
    const second = await holdAction(list.slug, holdId, 'extend', cookie);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ holdId, status: 'active', actions: { extend: false, release: true, purchase: true } });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ message: 'This hold has already been extended.', code: 'hold_already_extended' });
  });

  it('marks purchased; the list then shows the item purchased and the hold closed', async () => {
    const { list, cookie, holdId } = await heldByGuest();

    const purchased = await holdAction(list.slug, holdId, 'purchase', cookie);
    const view = (await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();
    const release = await holdAction(list.slug, holdId, 'release', cookie);

    expect(purchased.statusCode).toBe(200);
    expect(purchased.json()).toMatchObject({ status: 'purchased' });
    expect(view.items[0].status).toBe('purchased');
    expect(view.myHolds).toMatchObject([{ holdId, status: 'purchased', actions: { extend: false, release: false, purchase: false } }]);
    expect(release.statusCode).toBe(409);
    expect(release.json()).toMatchObject({ code: 'hold_not_active' });
  });

  it('releases; the hold leaves "my holds" and another guest can hold the item', async () => {
    const { list, cookie, holdId } = await heldByGuest();

    const released = await holdAction(list.slug, holdId, 'release', cookie);
    const view = (await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();
    const other = await guestOn(list);
    const retry = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie: other }, payload: { idempotencyKey: 'idem-2', name: 'Ada' },
    });

    expect(released.json()).toMatchObject({ status: 'released' });
    expect(view).toMatchObject({ items: [{ status: 'available' }], myHolds: [] });
    expect(retry.statusCode).toBe(201);
  });

  it.each(['extend', 'release', 'purchase'] as const)(
    '%s answers the generic 404 for anything but this session\'s hold on this list',
    async (action) => {
      const { list, cookie, holdId } = await heldByGuest();
      const otherGuest = await guestOn(list);
      const listB = await createList();
      const guestOnB = await guestOn(listB);

      const responses = await Promise.all([
        holdAction(list.slug, holdId, action, otherGuest),
        holdAction(listB.slug, holdId, action, guestOnB),
        holdAction(list.slug, 'not-a-uuid', action, cookie),
        holdAction(list.slug, '00000000-0000-7000-8000-999999999999', action, cookie),
        holdAction(list.slug, holdId, action),
        holdAction('no-such-list', holdId, action, cookie),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: 'Not found' });
      }
    },
  );
});

describe('lazy expiry and the configured duration over HTTP', () => {
  const T0 = new Date('2026-01-01T00:00:00.000Z');

  it.each(['release', 'purchase', 'lapse'] as const)(
    "answers the generic 404, not a state-revealing 409, when another session acts on a hold that was closed by %s",
    async (closing) => {
      const { timed, clock } = await appAt(T0);
      const { list, cookie, holdId } = await heldByGuest(timed);
      if (closing === 'lapse') clock.advance(3 * DAY + 1);
      else expect((await holdAction(list.slug, holdId, closing, cookie, timed)).statusCode).toBe(200);
      const otherGuest = await guestOn(list, timed);

      for (const action of ['extend', 'release', 'purchase'] as const) {
        const response = await holdAction(list.slug, holdId, action, otherGuest, timed);
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: 'Not found' });
      }
    },
  );

  it('advertises the configured HOLD_DURATION_DAYS and holds for exactly that long', async () => {
    const { timed } = await appAt(T0, { holdPolicy: { durationDays: 1 } });
    const { list, cookie, response } = await heldByGuest(timed);

    const view = (await timed.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();

    expect(view.capabilities).toEqual({ holdDurationDays: 1 });
    expect(response.json()).toMatchObject({ expiresAt: new Date(T0.getTime() + DAY).toISOString() });
  });
});

describe('guest access is checked before any list is loaded', () => {
  it('answers a request without a valid session cookie without reading any list, as for an unknown slug', async () => {
    const db = createDb(':memory:');
    await migrateToLatest(db);
    const deps = buildDependencies(db, undefined, { createSecret: 'test-create-secret' });
    const findBySlug = vi.spyOn(deps.wishlists, 'findBySlug');
    const guarded = buildApp(deps, { cookieSecret: 'test-secret' });
    disposeWithApp(guarded, db);
    onTestFinished(() => guarded.close());
    const list = await createList(guarded);
    findBySlug.mockClear();

    const forged = { cookie: 'gubbins_session=forged.signature' };
    const requests = [
      { method: 'GET', url: `/api/lists/${list.slug}` },
      { method: 'GET', url: `/api/lists/${list.slug}`, headers: forged },
      { method: 'GET', url: '/api/lists/no-such-list' },
      { method: 'POST', url: `/api/lists/${list.slug}/holds/some-hold/extend`, headers: forged },
      { method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: forged, payload: { idempotencyKey: 'k', name: 'Ada' } },
    ] as const;
    const responses = await Promise.all(requests.map((request) => guarded.inject(request)));

    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: 'Not found' });
    }
    expect(findBySlug).not.toHaveBeenCalled();
  });
});

describe('POST /api/lists/:slug/items', () => {
  const single = { type: 'single', title: 'Crib' };

  const addItem = (slug: string, cookie: string | undefined, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api/lists/${slug}/items`, headers: cookie ? { cookie } : {}, payload: payload as object });

  it('lets the owner add a single item', async () => {
    const list = await createList();
    const response = await addItem(list.slug, await ownerOn(list), single);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ itemId: expect.any(String) });
  });

  it('answers the same bare 404 without an owner cookie for this list', async () => {
    const list = await createList();
    const other = await createList();
    const requests = [
      [list.slug, undefined],
      [list.slug, await guestOn(list)],
      [list.slug, await ownerOn(other)],
      ['no-such-slug', await ownerOn(list)],
    ] as const;
    for (const [slug, cookie] of requests) {
      const response = await addItem(slug, cookie, single);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: 'Not found' });
    }
  });

  it('answers 409 no_payment_method for a group gift on a list without handles', async () => {
    const list = await createList();
    const response = await addItem(list.slug, await ownerOn(list), { type: 'group', title: 'Pram', priceMinor: 50000 });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'no_payment_method' });
  });
});

describe('PUT /api/lists/:slug', () => {
  const edit = (slug: string, cookie: string | undefined, payload: object) =>
    app.inject({ method: 'PUT', url: `/api/lists/${slug}`, headers: cookie ? { cookie } : {}, payload });

  it('the owner edits the list, and guests see the new title', async () => {
    const list = await createList();
    const response = await edit(list.slug, await ownerOn(list), { title: 'Welcome Baby', description: 'Thank you!' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const view = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie: await guestOn(list) } });
    expect(view.json()).toMatchObject({ title: 'Welcome Baby', description: 'Thank you!' });
  });

  it('answers a guest session without the owner cookie with the generic 404', async () => {
    const list = await createList();
    const response = await edit(list.slug, await guestOn(list), { title: 'Welcome Baby' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });
});

describe('PUT /api/lists/:slug/items/:itemId', () => {
  const edit = (slug: string, itemId: string, cookie: string | undefined, payload: object) =>
    app.inject({ method: 'PUT', url: `/api/lists/${slug}/items/${itemId}`, headers: cookie ? { cookie } : {}, payload });
  const details = { title: 'Travel system', quantity: 2, priceMinor: 25000 };

  it('the owner edits an item, and the manage view shows it', async () => {
    const list = await createList();
    const cookie = await ownerOn(list);
    const response = await edit(list.slug, list.itemId, cookie, details);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const view = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}/manage`, headers: { cookie } });
    expect(view.json()).toMatchObject({ items: [{ id: list.itemId, title: 'Travel system' }] });
  });

  it("answers another list's item with the generic 404", async () => {
    const list = await createList();
    const other = await createList();
    const response = await edit(list.slug, other.itemId, await ownerOn(list), details);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });

  it('answers a guest session without the owner cookie with the generic 404', async () => {
    const list = await createList();
    const response = await edit(list.slug, list.itemId, await guestOn(list), details);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });
});

describe('DELETE /api/lists/:slug/items/:itemId', () => {
  const remove = (slug: string, itemId: string, cookie: string | undefined) =>
    app.inject({ method: 'DELETE', url: `/api/lists/${slug}/items/${itemId}`, headers: cookie ? { cookie } : {} });
  const manageItems = async (slug: string, cookie: string) =>
    ((await app.inject({ method: 'GET', url: `/api/lists/${slug}/manage`, headers: { cookie } })).json() as { items: { id: string }[] }).items;

  it('the owner deletes an untouched item, and the manage view no longer lists it', async () => {
    const list = await createList();
    const cookie = await ownerOn(list);
    const response = await remove(list.slug, list.itemId, cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(await manageItems(list.slug, cookie)).toEqual([]);
  });

  it('answers an item a guest has held with 409 item_has_guest_history, and keeps it', async () => {
    const { list } = await heldByGuest();
    const cookie = await ownerOn(list);
    const response = await remove(list.slug, list.itemId, cookie);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'item_has_guest_history' });
    expect((await manageItems(list.slug, cookie)).map((i) => i.id)).toEqual([list.itemId]);
  });

  it('answers a guest session without the owner cookie with the generic 404', async () => {
    const list = await createList();
    const response = await remove(list.slug, list.itemId, await guestOn(list));
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });
});

describe('GET /api/lists/:slug/manage', () => {
  const manage = (slug: string, cookie?: string) => app.inject({ method: 'GET', url: `/api/lists/${slug}/manage`, headers: cookie ? { cookie } : {} });

  it('shows the owner their list and key', async () => {
    const list = await createList();
    const response = await manage(list.slug, await ownerOn(list));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ key: guestKey, items: [{ id: list.itemId, title: 'Stroller', deletable: true }] });
  });

  it('answers a guest session without the owner cookie with the generic 404', async () => {
    const list = await createList();
    const response = await manage(list.slug, await guestOn(list));
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });
});

describe('POST /api/lists/:slug/items/:itemId/contributions', () => {
  const pledge = (slug: string, itemId: string, cookie: string | undefined, payload: object = { idempotencyKey: 'idem-1', amountMinor: 2500, name: 'Ada' }) =>
    app.inject({ method: 'POST', url: `/api/lists/${slug}/items/${itemId}/contributions`, headers: cookie ? { cookie } : {}, payload });

  async function groupGift() {
    const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', venmoHandle: 'my-venmo', createSecret: 'test-create-secret', key: guestKey } }))
      .json() as { slug: string; ownerToken: string; key: string };
    const owner = extractCookieHeader(await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/owner-session`, payload: { ownerToken: list.ownerToken } }));
    const added = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/items`, headers: { cookie: owner }, payload: { type: 'group', title: 'Pram', priceMinor: 50000 } });
    return { list, groupId: (added.json() as { itemId: string }).itemId };
  }

  it('records a guest pledge and answers 201', async () => {
    const { list, groupId } = await groupGift();
    const cookie = await guestOn(list);

    const response = await pledge(list.slug, groupId, cookie);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ contributionId: expect.any(String), itemId: groupId, amountMinor: 2500 });
  });

  it('answers the generic 404 without a session, and for another list\'s item', async () => {
    const { list, groupId } = await groupGift();
    const other = await createList();

    const bare = await pledge(list.slug, groupId, undefined);
    expect(bare.statusCode).toBe(404);
    expect(bare.json()).toEqual({ message: 'Not found' });
    expect((await pledge(list.slug, other.itemId, await guestOn(list))).statusCode).toBe(404);
  });

  it.each([0, -2500])('answers an amount of %i as an invalid request, not as too much', async (amountMinor) => {
    const { list, groupId } = await groupGift();
    const response = await pledge(list.slug, groupId, await guestOn(list), { idempotencyKey: 'idem-1', amountMinor, name: 'Ada' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'Invalid request' });
  });

  it('answers 409 item_unavailable for a single item', async () => {
    const list = await createList();
    const response = await pledge(list.slug, list.itemId, await guestOn(list));
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'item_unavailable' });
  });
});
