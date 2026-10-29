import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import type { Database } from '../infrastructure/db/schema.js';
import type { Actor } from '../domain/Actor.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import type { Logger } from '../application/ports/Logger.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';

/**
 * ADR-0075: "A test should assert each type is appended only with its
 * currently permitted roles, so that a new shared path is a deliberate
 * change rather than an accident." Keyed by LedgerEvent['type'], so a new
 * event type does not compile until this table says who may raise it.
 * Owner release and owner purchase will widen their rows when they exist.
 */
const PERMITTED_ACTORS: Record<LedgerEvent['type'], readonly Actor[]> = {
  ItemHeld: ['guest'],
  HoldExtended: ['guest'],
  HoldReleased: ['guest'],
  ItemPurchased: ['guest'],
  ContributionPledged: ['guest'],
};

const silent: Logger = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };
let db: Kysely<Database>;
let app: FastifyInstance;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  app = buildApp(buildDependencies(db, silent, { createSecret: 'test-create-secret' }), { cookieSecret: 'test-secret' });
  disposeWithApp(app, db);
});

afterEach(async () => {
  await app.close();
});

function cookieOf(response: LightMyRequestResponse): string {
  const setCookie = response.headers['set-cookie'];
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
}

/** A new list holding one item its owner added, and a guest's session cookie on it. */
async function itemOnNewList(list: object, item: object) {
  const { slug, ownerToken, key } = (await app.inject({ method: 'POST', url: '/api/lists', payload: { ...list, createSecret: 'test-create-secret' } })).json() as { slug: string; ownerToken: string; key: string };
  const owner = cookieOf(await app.inject({ method: 'POST', url: `/api/lists/${slug}/owner-session`, payload: { ownerToken } }));
  const { itemId } = (await app.inject({ method: 'POST', url: `/api/lists/${slug}/items`, headers: { cookie: owner }, payload: item })).json() as { itemId: string };
  const cookie = cookieOf(await app.inject({ method: 'POST', url: `/api/lists/${slug}/session`, payload: { key } }));
  return { slug, itemId, cookie };
}

async function holdOnNewList() {
  const { slug, itemId, cookie } = await itemOnNewList({ listTitle: 'L' }, { type: 'single', title: 'I' });
  const { holdId } = (await app.inject({
    method: 'POST', url: `/api/lists/${slug}/items/${itemId}/hold`, headers: { cookie }, payload: { idempotencyKey: 'k', name: 'Ada' },
  })).json() as { holdId: string };
  const act = (action: string) => app.inject({ method: 'POST', url: `/api/lists/${slug}/holds/${holdId}/${action}`, headers: { cookie } });
  return { act };
}

async function pledgeOnNewList() {
  const { slug, itemId, cookie } = await itemOnNewList({ listTitle: 'G', venmoHandle: 'my-venmo' }, { type: 'group', title: 'Pram', priceMinor: 50000 });
  return app.inject({
    method: 'POST', url: `/api/lists/${slug}/items/${itemId}/contributions`, headers: { cookie }, payload: { idempotencyKey: 'k', amountMinor: 2500, name: 'Ada' },
  });
}

/** Every event type, through the real write path. */
async function raiseEveryEventType(): Promise<void> {
  const bought = await holdOnNewList();
  expect((await bought.act('extend')).statusCode).toBe(200);
  expect((await bought.act('purchase')).statusCode).toBe(200);
  const dropped = await holdOnNewList();
  expect((await dropped.act('release')).statusCode).toBe(200);
  expect((await pledgeOnNewList()).statusCode).toBe(201);
}

describe('ledger events and their actors (ADR-0075)', () => {
  it('appends every event type, each only with a role permitted to raise it', async () => {
    await raiseEveryEventType();

    const rows = await db.selectFrom('event_log').select(['event_type', 'actor']).execute();

    expect(new Set(rows.map((r) => r.event_type))).toEqual(new Set(Object.keys(PERMITTED_ACTORS)));
    for (const { event_type, actor } of rows) {
      expect(PERMITTED_ACTORS[event_type as LedgerEvent['type']], `${event_type} appended as ${actor}`).toContain(actor);
    }
  });

  it('versions every payload, stamps when it happened, and keeps the actor out of it', async () => {
    await raiseEveryEventType();

    const rows = await db.selectFrom('event_log').select('payload').execute();

    for (const { payload } of rows) {
      const event = JSON.parse(payload) as Record<string, unknown>;
      expect(event).toMatchObject({ v: 1, occurredAt: expect.any(String) });
      expect(event).not.toHaveProperty('actor');
    }
  });
});
