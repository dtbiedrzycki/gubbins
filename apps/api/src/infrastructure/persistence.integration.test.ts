import { beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import type { Database } from './db/schema.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';
import { EventStoreKysely } from './EventStoreKysely.js';
import { UnitOfWorkKysely } from './UnitOfWorkKysely.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { ConcurrencyError } from '../domain/errors.js';
import { anItemHeldEvent } from '../application/test-fakes/builders.js';

const W1 = '11111111-1111-7111-8111-111111111111';
const I1 = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00.000Z');

let db: Kysely<Database>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
});

describe('EventStoreKysely', () => {
  it('appends events when expectedSeq matches the stream length', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    const rows = await db.selectFrom('event_log').selectAll().where('item_id', '=', I1).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(1);
  });

  it('records the actor on the row as envelope metadata, not in the payload (ADR-0075)', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    const row = await db.selectFrom('event_log').select(['actor', 'payload']).where('item_id', '=', I1).executeTakeFirstOrThrow();
    expect(row.actor).toBe('guest');
    expect(JSON.parse(row.payload)).not.toHaveProperty('actor');
    expect(JSON.parse(row.payload)).toMatchObject({ v: 1 });
  });

  it('throws ConcurrencyError when expectedSeq is stale', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [anItemHeldEvent({ itemId: I1 })], 'guest');

    await expect(
      store.append(I1, 0, [anItemHeldEvent({ itemId: I1, holdId: '66666666-6666-7666-8666-666666666666' })], 'guest'),
    ).rejects.toThrow(ConcurrencyError);
  });
});

describe('UnitOfWorkKysely', () => {
  it('commits all writes made inside a successful execute() call', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await unitOfWork.execute(async (ctx) => {
      await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
    });

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123', NOW)).not.toBeNull();
  });

  it('rolls back all writes when the callback throws', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await expect(
      unitOfWork.execute(async (ctx) => {
        await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123', NOW)).toBeNull();
  });
});
