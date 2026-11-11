import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createDb } from './createDb.js';
import { migrations } from './migrations/index.js';
import { runMigrations } from './runMigrations.js';

const LIST_A = '11111111-1111-7111-8111-111111111111';
const LIST_B = '22222222-2222-7222-8222-222222222222';
const id = (n: number) => `33333333-3333-7333-8333-${String(n).padStart(12, '0')}`;

let db: Kysely<unknown>;

beforeEach(() => {
  db = createDb(':memory:') as unknown as Kysely<unknown>;
});

afterEach(async () => {
  await db.destroy();
});

async function seed(listId: string, slug: string, items: [id: string, createdAt: string][]) {
  await sql`insert into wishlists (id, slug, title, owner_token, key, key_gen, created_at) values (${listId}, ${slug}, 't', 'o', 'k', 1, '2026-01-01T00:00:00.000Z')`.execute(db);
  for (const [itemId, createdAt] of items) {
    await sql`insert into items (id, wishlist_id, type, title, quantity, created_at) values (${itemId}, ${listId}, 'single', 'x', 1, ${createdAt})`.execute(db);
  }
}

describe('0002_item_positions', () => {
  it("numbers each list's items from 0, oldest first, breaking a tie by id", async () => {
    await runMigrations(db, { '0001_init': migrations['0001_init']! });
    // Ids are out of age order; the last two share a created_at.
    await seed(LIST_A, 'a', [[id(1), '2026-01-03T00:00:00.000Z'], [id(2), '2026-01-01T00:00:00.000Z'], [id(3), '2026-01-02T00:00:00.000Z']]);
    await seed(LIST_B, 'b', [[id(6), '2026-01-02T00:00:00.000Z'], [id(5), '2026-01-02T00:00:00.000Z'], [id(4), '2026-01-01T00:00:00.000Z']]);

    await runMigrations(db);

    const order = async (listId: string) => (await sql<{ id: string; position: number }>`select id, position from items where wishlist_id = ${listId} order by position`.execute(db)).rows;
    expect(await order(LIST_A)).toEqual([{ id: id(2), position: 0 }, { id: id(3), position: 1 }, { id: id(1), position: 2 }]);
    expect(await order(LIST_B)).toEqual([{ id: id(4), position: 0 }, { id: id(5), position: 1 }, { id: id(6), position: 2 }]);
  });
});
