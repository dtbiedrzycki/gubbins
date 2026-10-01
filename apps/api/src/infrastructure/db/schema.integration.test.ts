import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql, type Insertable, type Kysely } from 'kysely';
import { createDb } from './createDb.js';
import { migrateToLatest } from './migrate.js';
import type { Database, HoldsTable } from './schema.js';

const W1 = '11111111-1111-7111-8111-111111111111';
const I1 = '33333333-3333-7333-8333-333333333333';
const NOW = '2026-01-01T00:00:00.000Z';

let db: Kysely<Database>;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  await db.insertInto('wishlists').values({ id: W1, slug: 's', title: 't', owner_token: 'o', key: 'k', key_gen: 1, created_at: NOW }).execute();
  await db.insertInto('items').values({ id: I1, wishlist_id: W1, type: 'single', title: 'Cot', quantity: 1, created_at: NOW }).execute();
});

afterEach(async () => {
  await db.destroy();
});

function holdRow(overrides: Partial<Insertable<HoldsTable>> = {}): Insertable<HoldsTable> {
  return {
    id: '55555555-5555-7555-8555-555555555555', item_id: I1, secret: 's', session_hash: 'a'.repeat(64),
    idempotency_key: 'idem-1', expires_at: NOW, created_at: NOW, ...overrides,
  };
}

describe('0001_init, as amended for holds stack A', () => {
  it("stores a hold's lifecycle timestamps, each null until set", async () => {
    await db.insertInto('holds').values(holdRow()).execute();

    const row = await db.selectFrom('holds').select(['extended_at', 'released_at', 'purchased_at']).executeTakeFirstOrThrow();

    expect(row).toEqual({ extended_at: null, released_at: null, purchased_at: null });
  });

  it('refuses a hold that is both released and purchased', async () => {
    await expect(db.insertInto('holds').values(holdRow({ released_at: NOW, purchased_at: NOW })).execute())
      .rejects.toThrow(/CHECK constraint failed/);
  });

  it("defaults an item's purchased_count to 0", async () => {
    await db.insertInto('item_state').values({ item_id: I1, seq: 0, active_holds: 0, updated_at: NOW }).execute();

    const row = await db.selectFrom('item_state').select('purchased_count').executeTakeFirstOrThrow();

    expect(row.purchased_count).toBe(0);
  });

  it('refuses a negative purchased_count', async () => {
    await expect(db.insertInto('item_state').values({ item_id: I1, seq: 0, active_holds: 0, purchased_count: -1, updated_at: NOW }).execute())
      .rejects.toThrow(/CHECK constraint failed/);
  });

  it('indexes holds by item and by session', async () => {
    const { rows } = await sql<{ name: string }>`select name from pragma_index_list('holds')`.execute(db);

    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(['holds_item_id_idx', 'holds_session_hash_idx']));
  });
});
