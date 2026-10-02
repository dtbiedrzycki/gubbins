import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql, type Insertable, type Kysely } from 'kysely';
import { createDb } from './createDb.js';
import { StaleSchemaError } from './assertSchemaMatches.js';
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

describe('0001_init schema', () => {
  it("stores a hold's lifecycle timestamps, each null until set", async () => {
    await db.insertInto('holds').values(holdRow()).execute();

    const row = await db.selectFrom('holds').select(['extended_at', 'released_at', 'purchased_at']).executeTakeFirstOrThrow();

    expect(row).toEqual({ extended_at: null, released_at: null, purchased_at: null });
  });

  it('refuses a hold that is both released and purchased', async () => {
    await expect(db.insertInto('holds').values(holdRow({ released_at: NOW, purchased_at: NOW })).execute())
      .rejects.toThrow(/CHECK constraint failed/);
  });

  it('indexes holds by item and by session', async () => {
    const { rows } = await sql<{ name: string }>`select name from pragma_index_list('holds')`.execute(db);

    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(['holds_item_id_idx', 'holds_session_hash_idx']));
  });

  it('refuses an event row without an actor', async () => {
    await expect(sql`insert into event_log (item_id, seq, event_type, payload, recorded_at) values (${I1}, 1, 'ItemHeld', '{}', ${NOW})`.execute(db))
      .rejects.toThrow(/NOT NULL constraint failed: event_log.actor/);
  });

  it('refuses an actor other than guest or owner — there is no system role (ADR-0075)', async () => {
    await expect(sql`insert into event_log (item_id, seq, event_type, actor, payload, recorded_at) values (${I1}, 1, 'ItemHeld', 'system', '{}', ${NOW})`.execute(db))
      .rejects.toThrow(/CHECK constraint failed/);
  });

  it('accepts both roles', async () => {
    await sql`insert into event_log (item_id, seq, event_type, actor, payload, recorded_at) values (${I1}, 1, 'ItemHeld', 'guest', '{}', ${NOW})`.execute(db);
    await sql`insert into event_log (item_id, seq, event_type, actor, payload, recorded_at) values (${I1}, 2, 'HoldReleased', 'owner', '{}', ${NOW})`.execute(db);

    const { rows } = await sql<{ actor: string }>`select actor from event_log order by seq`.execute(db);
    expect(rows.map((r) => r.actor)).toEqual(['guest', 'owner']);
  });
});

describe('migrateToLatest on a database an older build created', () => {
  it('refuses to start, naming the table and how to recover', async () => {
    const stale = createDb(':memory:');
    // The skeleton's event_log, before ADR-0075 added `actor`.
    await sql`create table event_log (id integer primary key autoincrement, item_id text not null, seq integer not null,
      event_type text not null, payload text not null, recorded_at text not null)`.execute(stale);

    const migrating = migrateToLatest(stale);

    await expect(migrating).rejects.toThrow(StaleSchemaError);
    await expect(migrating).rejects.toThrow(/"event_log".*recreate the database.*DATABASE_PATH/s);
    await stale.destroy();
  });

  it('accepts a database the current migration created, run again', async () => {
    await expect(migrateToLatest(db)).resolves.toBeUndefined();
  });
});
