import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import { createDb } from './createDb.js';
import { migrations } from './migrations/index.js';

const NOW = '2026-01-01T00:00:00.000Z';

let db: Kysely<unknown>;

beforeEach(() => {
  db = createDb(':memory:') as unknown as Kysely<unknown>;
});

afterEach(async () => {
  await db.destroy();
});

describe('clearing hold messages', () => {
  it("clears every hold's message and keeps pledge messages", async () => {
    const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
    await migrator.migrateTo('0001_init');
    await sql`insert into wishlists (id, slug, title, owner_token, key, key_gen, created_at) values ('w1', 's', 't', 'o', 'k', 1, ${NOW})`.execute(db);
    await sql`insert into items (id, wishlist_id, type, title, quantity, created_at) values ('i1', 'w1', 'single', 'Cot', 1, ${NOW})`.execute(db);
    await sql`insert into guest_pii (id, name, message, created_at) values ('p-hold', 'Ann', 'Congrats', ${NOW}), ('p-pledge', 'Bob', 'Chipping in', ${NOW})`.execute(db);
    await sql`insert into holds (id, item_id, secret, session_hash, idempotency_key, units, expires_at, pii_ref, created_at) values ('h1', 'i1', 's', 'a', 'k1', 1, ${NOW}, 'p-hold', ${NOW})`.execute(db);
    await sql`insert into contributions (id, item_id, amount_minor, session_hash, idempotency_key, pii_ref, pledged_at, created_at) values ('c1', 'i1', 500, 'b', 'k2', 'p-pledge', ${NOW}, ${NOW})`.execute(db);

    const { error } = await migrator.migrateToLatest();
    if (error) throw error;

    const { rows } = await sql<{ id: string; message: string | null }>`select id, message from guest_pii order by id`.execute(db);
    expect(rows).toEqual([{ id: 'p-hold', message: null }, { id: 'p-pledge', message: 'Chipping in' }]);
  });
});
