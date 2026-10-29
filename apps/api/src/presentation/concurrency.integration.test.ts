import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import type { Database } from '../infrastructure/db/schema.js';
import type { Logger } from '../application/ports/Logger.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';

const silent: Logger = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };
const N = 10;

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

async function listWithGuests(guests: number) {
  const created = (await app.inject({ method: 'POST', url: '/api/lists', payload: { listTitle: 'Baby Shower', createSecret: 'test-create-secret' } }))
    .json() as { slug: string; ownerToken: string; key: string };
  const owner = cookieOf(await app.inject({ method: 'POST', url: `/api/lists/${created.slug}/owner-session`, payload: { ownerToken: created.ownerToken } }));
  const { itemId } = (await app.inject({ method: 'POST', url: `/api/lists/${created.slug}/items`, headers: { cookie: owner }, payload: { type: 'single', title: 'Stroller' } }))
    .json() as { itemId: string };
  const list = { ...created, itemId };
  const cookies: string[] = [];
  for (let i = 0; i < guests; i += 1) {
    cookies.push(cookieOf(await app.inject({ method: 'POST', url: `/api/lists/${list.slug}/session`, payload: { key: list.key } })));
  }
  return { list, cookies };
}

describe('concurrency on a quantity-1 item (testing spec)', () => {
  it(`lets exactly one of ${N} parallel holds from different guests through`, async () => {
    const { list, cookies } = await listWithGuests(N);

    const responses = await Promise.all(cookies.map((cookie, i) => app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: `tap-${i}`, name: 'Ada' },
    })));

    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, ...Array(N - 1).fill(409)]);
    expect(await db.selectFrom('holds').select('id').execute()).toHaveLength(1);
    expect(await db.selectFrom('event_log').select('id').execute()).toHaveLength(1);
  });

  it('turns a parallel double submit of one key into one hold, answered twice (ADR-0048)', async () => {
    const { list, cookies: [cookie] } = await listWithGuests(1);
    const submit = () => app.inject({
      method: 'POST', url: `/api/lists/${list.slug}/items/${list.itemId}/hold`,
      headers: { cookie }, payload: { idempotencyKey: 'same-tap', name: 'Ada' },
    });

    const [first, second] = await Promise.all([submit(), submit()]);

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(second.json()).toEqual(first.json());
    expect(await db.selectFrom('holds').select('id').execute()).toHaveLength(1);
  });
});
