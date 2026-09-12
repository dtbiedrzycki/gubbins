import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { ConcurrencyError } from '../domain/errors.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';

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

    const sessionResponse = await raceApp.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } });
    const cookie = extractCookieHeader(sessionResponse);

    const response = await raceApp.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'idem-1' },
    });

    expect(response.statusCode).toBe(409);
  });
});
