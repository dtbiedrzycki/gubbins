import { beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import type { Database } from './db/schema.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';
import { UnitOfWorkKysely } from './UnitOfWorkKysely.js';
import { Wishlist } from '../domain/entities/Wishlist.js';

const W1 = '11111111-1111-7111-8111-111111111111';
const NOW = new Date('2026-01-01T00:00:00.000Z');

let db: Kysely<Database>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
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
