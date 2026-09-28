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
import { ConcurrencyError, ItemNotFoundError } from '../domain/errors.js';

const W1 = '11111111-1111-7111-8111-111111111111';
const W2 = '22222222-2222-7222-8222-222222222222';
const I1 = '33333333-3333-7333-8333-333333333333';
const I2 = '44444444-4444-7444-8444-444444444444';
const H1 = '55555555-5555-7555-8555-555555555555';

let db: Kysely<Database>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
});

describe('WishlistRepositoryKysely', () => {
  it('round-trips a wishlist through insert and findBySlug', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });

    await repo.insert(wishlist);
    const found = await repo.findBySlug('abc123');

    expect(found).toEqual(wishlist);
  });

  it('returns null for an unknown slug', async () => {
    const repo = new WishlistRepositoryKysely(db);
    expect(await repo.findBySlug('no-such-slug')).toBeNull();
  });

  it('round-trips a wishlist together with its attached item', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    wishlist.addItem({ title: 'Stroller' }, { generateId: () => I1 });

    await repo.insert(wishlist);
    const found = await repo.findBySlug('abc123');

    expect(found?.item?.id.value).toBe(I1);
    expect(found?.item?.title).toBe('Stroller');
    expect(found?.item?.status).toBe('available');
  });

  it('findById loads the full aggregate, item included', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    wishlist.addItem({ title: 'Stroller' }, { generateId: () => I1 });
    await repo.insert(wishlist);

    const found = await repo.findById(W1);

    expect(found?.item?.id.value).toBe(I1);
    expect(found?.item?.title).toBe('Stroller');
    expect(found?.item?.status).toBe('available');
  });

  it('returns null for an unknown id', async () => {
    const repo = new WishlistRepositoryKysely(db);
    expect(await repo.findById('no-such-id')).toBeNull();
  });

  it('markItemHeld marks the wishlist item held', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const wishlist = Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    wishlist.addItem({ title: 'Stroller' }, { generateId: () => I1 });
    await repo.insert(wishlist);

    await repo.markItemHeld(W1, I1, 1);

    const found = await repo.findById(W1);
    expect(found?.item?.status).toBe('held');
  });

  it('markItemHeld throws ItemNotFoundError for an item in a different wishlist', async () => {
    const repo = new WishlistRepositoryKysely(db);
    const first = Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' });
    first.addItem({ title: 'Stroller' }, { generateId: () => I1 });
    const second = Wishlist.create({ id: W2, slug: 'wishlist-w2', title: 'Wedding', ownerToken: 'owner-tok-2', key: 'guest-key-2' });
    second.addItem({ title: 'Toaster' }, { generateId: () => I2 });
    await repo.insert(first);
    await repo.insert(second);

    await expect(repo.markItemHeld(W2, I1, 1)).rejects.toThrow(ItemNotFoundError);
    expect((await repo.findById(W1))?.item?.status).toBe('available');
  });
});

describe('ItemRepositoryKysely', () => {
  it('inserting an item also creates an available item_state row', async () => {
    const repo = new ItemRepositoryKysely(db);
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    const item = Item.createSingle({ id: I1, wishlistId: W1, title: 'Stroller' });

    await repo.insert(item);

    const found = await repo.findByWishlistId(W1);
    expect(found).toEqual(item);
    expect(found?.seq).toBe(0);
    expect(found?.activeHolds).toBe(0);
    expect(found?.status).toBe('available');
  });

  it('markHeld increments activeHolds and sets status/seq', async () => {
    const repo = new ItemRepositoryKysely(db);
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    await repo.insert(Item.createSingle({ id: I1, wishlistId: W1, title: 'Stroller' }));

    await repo.markHeld(I1, 1);

    const found = await repo.findInWishlist(W1, I1);
    expect(found?.seq).toBe(1);
    expect(found?.activeHolds).toBe(1);
    expect(found?.status).toBe('held');
  });

  it('findByWishlistId finds the item belonging to a wishlist', async () => {
    const repo = new ItemRepositoryKysely(db);
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    await repo.insert(Item.createSingle({ id: I1, wishlistId: W1, title: 'Stroller' }));

    const found = await repo.findByWishlistId(W1);

    expect(found?.id.value).toBe(I1);
  });

  it('findInWishlist finds an item that belongs to the given wishlist', async () => {
    const repo = new ItemRepositoryKysely(db);
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    await repo.insert(Item.createSingle({ id: I1, wishlistId: W1, title: 'Stroller' }));

    const found = await repo.findInWishlist(W1, I1);

    expect(found?.id.value).toBe(I1);
  });

  it('findInWishlist returns null for an item that belongs to a different wishlist', async () => {
    const repo = new ItemRepositoryKysely(db);
    const wishlists = new WishlistRepositoryKysely(db);
    await wishlists.insert(Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    await wishlists.insert(Wishlist.create({ id: W2, slug: 'wishlist-w2', title: 'Wedding', ownerToken: 'owner-tok-2', key: 'guest-key-2' }));
    await repo.insert(Item.createSingle({ id: I1, wishlistId: W1, title: 'Stroller' }));

    expect(await repo.findInWishlist(W2, I1)).toBeNull();
  });

  it('findInWishlist returns null for an unknown item id', async () => {
    const repo = new ItemRepositoryKysely(db);
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));

    expect(await repo.findInWishlist(W1, 'no-such-item')).toBeNull();
  });
});

describe('HoldRepositoryKysely', () => {
  it('round-trips a hold through recordHold and findByIdempotencyKey', async () => {
    await new WishlistRepositoryKysely(db).insert(Wishlist.create({ id: W1, slug: 'wishlist-w1', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' }));
    await new ItemRepositoryKysely(db).insert(Item.createSingle({ id: I1, wishlistId: W1, title: 'Stroller' }));
    const repo = new HoldRepositoryKysely(db);
    const expiresAt = new Date('2026-01-04T00:00:00.000Z');

    await repo.recordHold({ id: H1, itemId: I1, secret: 'secret', sessionHash: 'hash', idempotencyKey: 'idem-1', expiresAt });
    const found = await repo.findByIdempotencyKey(I1, 'idem-1');

    expect(found).toEqual({ id: H1, itemId: I1, secret: 'secret', sessionHash: 'hash', idempotencyKey: 'idem-1', expiresAt });
  });

  it('returns null for an unknown idempotency key', async () => {
    const repo = new HoldRepositoryKysely(db);
    expect(await repo.findByIdempotencyKey(I1, 'no-such-key')).toBeNull();
  });
});

describe('EventStoreKysely', () => {
  it('appends events when expectedSeq matches the stream length', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [{ type: 'ItemHeld', occurredAt: '2026-01-01T00:00:00.000Z' }]);

    const rows = await db.selectFrom('event_log').selectAll().where('item_id', '=', I1).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(1);
  });

  it('throws ConcurrencyError when expectedSeq is stale', async () => {
    const store = new EventStoreKysely(db);
    await store.append(I1, 0, [{ type: 'ItemHeld', occurredAt: '2026-01-01T00:00:00.000Z' }]);

    await expect(
      store.append(I1, 0, [{ type: 'ItemHeld', occurredAt: '2026-01-01T00:00:01.000Z' }]),
    ).rejects.toThrow(ConcurrencyError);
  });
});

describe('UnitOfWorkKysely', () => {
  it('commits all writes made inside a successful execute() call', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await unitOfWork.execute(async (ctx) => {
      await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
    });

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123')).not.toBeNull();
  });

  it('rolls back all writes when the callback throws', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await expect(
      unitOfWork.execute(async (ctx) => {
        await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123')).toBeNull();
  });
});
