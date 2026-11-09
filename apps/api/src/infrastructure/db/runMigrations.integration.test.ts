import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createDb } from './createDb.js';
import { runMigrations } from './runMigrations.js';

let db: Kysely<unknown>;

beforeEach(() => {
  db = createDb(':memory:') as unknown as Kysely<unknown>;
});

afterEach(async () => {
  await db.destroy();
});

describe('runMigrations', () => {
  it('runs a pending migration once, however often it is called', async () => {
    const list = {
      '0001_a': {
        up: async (m: Kysely<unknown>) => {
          await sql`create table t (n integer)`.execute(m);
          await sql`insert into t values (1)`.execute(m);
        },
      },
    };

    await runMigrations(db, list);
    await runMigrations(db, list);

    const { rows } = await sql<{ count: number }>`select count(*) as count from t`.execute(db);
    expect(rows).toEqual([{ count: 1 }]);
  });

  it('rolls back a migration that fails partway and does not record it', async () => {
    const list = {
      '0001_a': {
        up: async (m: Kysely<unknown>) => {
          await sql`create table t (n integer)`.execute(m);
          throw new Error('boom');
        },
      },
    };

    await expect(runMigrations(db, list)).rejects.toThrow(/boom/);

    const table = await sql`select name from pragma_table_info('t')`.execute(db);
    expect(table.rows).toEqual([]);
    const recorded = await sql`select name from kysely_migration`.execute(db);
    expect(recorded.rows).toEqual([]);
  });

  it('rolls back a migration whose record cannot be written', async () => {
    await runMigrations(db, {});
    await sql`create trigger refuse_record before insert on kysely_migration begin select raise(abort, 'disk full'); end`.execute(db);
    const list = { '0001_a': { up: async (m: Kysely<unknown>) => { await sql`create table t (n integer)`.execute(m); } } };

    await expect(runMigrations(db, list)).rejects.toThrow(/disk full/);

    const table = await sql`select name from pragma_table_info('t')`.execute(db);
    expect(table.rows).toEqual([]);
  });
});
