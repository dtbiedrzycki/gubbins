import { beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import type { Database } from './db/schema.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';
import { ItemRepositoryKysely } from './ItemRepositoryKysely.js';
import { HoldRepositoryKysely } from './HoldRepositoryKysely.js';
import { EventStoreKysely } from './EventStoreKysely.js';
import { UnitOfWorkKysely } from './UnitOfWorkKysely.js';
import { Wishlist } from '../domain/entities/Wishlist.js';
import { Item } from '../domain/entities/Item.js';
import { ConcurrencyError } from '../domain/errors.js';

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
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: 'w1', slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    const item = Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' });

    await repo.insert(item);

    expect(await repo.findById('i1')).toEqual(item);
    expect(await repo.getState('i1')).toEqual({ seq: 0, activeHolds: 0, status: 'available' });
  });

  it('markHeld increments activeHolds and sets status/seq', async () => {
    const repo = new ItemRepositoryKysely(db);
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: 'w1', slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    await repo.insert(Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' }));

    await repo.markHeld('i1', 1);

    expect(await repo.getState('i1')).toEqual({ seq: 1, activeHolds: 1, status: 'held' });
  });

  it('findByWishlistId finds the item belonging to a wishlist', async () => {
    const repo = new ItemRepositoryKysely(db);
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: 'w1', slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    await repo.insert(Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Stroller' }));

    const found = await repo.findByWishlistId('w1');

    expect(found?.id).toBe('i1');
  });
});

describe('HoldRepositoryKysely', () => {
  it('round-trips a hold through recordHold and findByIdempotencyKey', async () => {
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: 'w1', slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
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
