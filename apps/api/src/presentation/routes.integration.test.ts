import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { FixedClock } from '../application/test-fakes/FixedClock.js';
import { ConcurrencyError } from '../domain/errors.js';
import type { Logger } from '../application/ports/Logger.js';
import { buildDependencies, type BuildDependenciesOptions } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';

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
  disposeWithApp(app, db);
});

afterEach(async () => {
  await app.close();
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
});

async function createList() {
  const response = await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } });
  return response.json() as { slug: string; ownerToken: string; key: string; itemId: string };
}

const DAY = 24 * 60 * 60 * 1000;

async function guestOn(list: { slug: string; key: string }, on: FastifyInstance = app): Promise<string> {
  return extractCookieHeader(await on.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } }));
}

function holdAction(slug: string, holdId: string, action: 'extend' | 'release' | 'purchase', cookie?: string, on: FastifyInstance = app) {
  return on.inject({ method: 'POST', url: `/api/lists/${slug}/holds/${holdId}/${action}`, headers: cookie ? { cookie } : {} });
}

async function heldByGuest(on: FastifyInstance = app) {
  const list = (await on.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } }))
    .json() as { slug: string; key: string; itemId: string };
  const cookie = await guestOn(list, on);
  const response = await on.inject({
    method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
  });
  return { list, cookie, response, holdId: (response.json() as { holdId: string }).holdId };
}

/** An app on its own database whose clock the test steps, for expiry. */
async function appAt(start: Date, options: Omit<BuildDependenciesOptions, 'clock'> = {}) {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  const clock = new FixedClock(start);
  const timed = buildApp(buildDependencies(db, undefined, { ...options, clock }), { cookieSecret: 'test-secret' });
  disposeWithApp(timed, db);
  onTestFinished(() => timed.close());
  return { timed, clock };
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
  it('returns the same generic 404 without a session cookie as for an unknown slug (ADR-0016/0054 anti-enumeration)', async () => {
    const list = await createList();
    const response = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}` });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });

  it('returns the list view for a valid session, with the item available', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const response = await app.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      title: 'Baby Shower',
      item: { id: list.itemId, title: 'Stroller', status: 'available' },
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
    expect(second.json()).toEqual({ message: 'This item is no longer available.', code: 'item_unavailable' });
  });

  it('replays the original hold for a repeated idempotency key instead of creating a second hold', async () => {
    const list = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const first = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
    });
    const second = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
  });

  it('returns the same generic 404 without a session cookie as for an unknown slug (ADR-0016/0054 anti-enumeration)', async () => {
    const list = await createList();
    const response = await app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, payload: { idempotencyKey: 'idem-1' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });

  it('returns a generic 404 when the item belongs to a different wishlist than the URL slug', async () => {
    const listA = await createList();
    const listB = await createList();
    const sessionResponse = await app.inject({ method: 'POST', url: `/api/lists/${listA.slug}/session`, payload: { key: listA.key } });
    const cookie = extractCookieHeader(sessionResponse);

    // A valid session for list A, but the item id in the URL belongs to list B.
    const response = await app.inject({
      method: 'POST', url: `/api/lists/${listA.slug}/items/${listB.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });

  it('maps a ConcurrencyError from the use case to 409', async () => {
    const db = createDb(':memory:');
    await migrateToLatest(db);
    const deps = buildDependencies(db);
    const seedApp = buildApp(deps, { cookieSecret: 'test-secret' });
    const createResponse = await seedApp.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } });
    const list = createResponse.json() as { slug: string; key: string; itemId: string };

    // Swap in a holdItem stub that reproduces the race EventStoreKysely.append
    // detects (two concurrent HoldItem calls disagreeing on the stream's seq),
    // to prove the route maps ConcurrencyError to 409 rather than falling
    // through to the generic 500 handler.
    const throwingHoldItem = { execute: async () => { throw new ConcurrencyError(list.itemId, 0, 1); } };
    const raceApp = buildApp({ ...deps, holdItem: throwingHoldItem as unknown as typeof deps.holdItem }, { cookieSecret: 'test-secret' });
    // Both apps share this test's own database, so neither owns it: close
    // them, then destroy the database once.
    onTestFinished(async () => {
      await Promise.all([seedApp.close(), raceApp.close()]);
      await db.destroy();
    });

    const sessionResponse = await raceApp.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const response = await raceApp.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
    });

    expect(response.statusCode).toBe(409);
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

    const response = await brokenApp.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } });

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

    await brokenApp.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', itemTitle: 'Stroller' } });

    const entry = logged.find((l) => l.message === 'response_schema_mismatch');
    expect(entry?.meta?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['slug'], code: 'invalid_type' })]));
    expect(JSON.stringify(entry?.meta)).not.toContain('42');
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
    ['an unsupported content type', 'application/x-www-form-urlencoded', 'listTitle=x&itemTitle=y'],
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
      method: 'POST', url: `/api/lists/${list.slug}/items/${other.itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'idem-x' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Not found' });
  });

  it('answers a hold with the full hold view', async () => {
    const { response } = await heldByGuest();
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'active', extendedAt: null, actions: { extend: true, release: true, purchase: true } });
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
    expect(view.item.status).toBe('purchased');
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
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`, headers: { cookie: other }, payload: { idempotencyKey: 'idem-2' },
    });

    expect(released.json()).toMatchObject({ status: 'released' });
    expect(view).toMatchObject({ item: { status: 'available' }, myHolds: [] });
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

  it('frees the item the moment a hold lapses, and still lets its guest mark it purchased', async () => {
    const { timed, clock } = await appAt(T0);
    const { list, cookie, holdId } = await heldByGuest(timed);

    clock.advance(3 * DAY + 1);
    const view = (await timed.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();
    const extend = await holdAction(list.slug, holdId, 'extend', cookie, timed);
    const purchase = await holdAction(list.slug, holdId, 'purchase', cookie, timed);

    expect(view.item.status).toBe('available');
    expect(view.myHolds).toMatchObject([{ holdId, status: 'expired', actions: { extend: false, release: false, purchase: true } }]);
    expect(extend.statusCode).toBe(409);
    expect(extend.json()).toMatchObject({ code: 'hold_not_active' });
    expect(purchase.json()).toMatchObject({ status: 'purchased' });
  });

  it('advertises the configured HOLD_DURATION_DAYS and holds for exactly that long', async () => {
    const { timed } = await appAt(T0, { holdPolicy: { durationDays: 1 } });
    const { list, cookie, response } = await heldByGuest(timed);

    const view = (await timed.inject({ method: 'GET', url: `/api/lists/${list.slug}`, headers: { cookie } })).json();

    expect(view.capabilities).toEqual({ holdDurationDays: 1 });
    expect(response.json()).toMatchObject({ expiresAt: new Date(T0.getTime() + DAY).toISOString() });
  });
});
