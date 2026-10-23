import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import type { Database } from './db/schema.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';
import { UnitOfWorkKysely } from './UnitOfWorkKysely.js';
import { GuestPiiRepositoryKysely } from './GuestPiiRepositoryKysely.js';
import { GuestDetails } from '../domain/value-objects/GuestDetails.js';
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
      await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key', asOf: NOW }));
    });

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123', NOW)).not.toBeNull();
  });

  it('rolls back all writes when the callback throws', async () => {
    const unitOfWork = new UnitOfWorkKysely(db);

    await expect(
      unitOfWork.execute(async (ctx) => {
        await ctx.wishlists.insert(Wishlist.create({ id: W1, slug: 'abc123', title: 'Baby Shower', ownerToken: 'tok', key: 'key', asOf: NOW }));
        await ctx.guestPii.insert('pii-1', GuestDetails.from({ name: 'Ada' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await new WishlistRepositoryKysely(db).findBySlug('abc123', NOW)).toBeNull();
    expect(await new GuestPiiRepositoryKysely(db).findById('pii-1')).toBeNull();
  });

  it('takes the write lock at BEGIN, so a second writer cannot even start (BEGIN IMMEDIATE)', async () => {
    // Two connections need a file; an in-memory database is per-connection.
    const dir = mkdtempSync(join(tmpdir(), 'gubbins-uow-'));
    const first = createDb(join(dir, 'test.db'));
    await migrateToLatest(first);
    // No busy wait: better-sqlite3 waits synchronously, which on one thread
    // would block the first transaction from ever finishing.
    const second = createDb(join(dir, 'test.db'), { busyTimeoutMs: 0 });
    onTestFinished(async () => {
      await first.destroy();
      await second.destroy();
      rmSync(dir, { recursive: true, force: true });
    });

    let secondStarted = false;
    await new UnitOfWorkKysely(first).execute(async () => {
      await expect(new UnitOfWorkKysely(second).execute(async () => { secondStarted = true; }))
        .rejects.toMatchObject({ code: 'SQLITE_BUSY' });
    });

    // A deferred BEGIN would have let the second transaction start and read,
    // failing only at its first write — the read-then-decide window the hold
    // rules must not have.
    expect(secondStarted).toBe(false);
  });
});
