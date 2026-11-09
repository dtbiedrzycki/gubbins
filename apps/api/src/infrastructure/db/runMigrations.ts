import type { Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import { migrations } from './migrations/index.js';

/** Runs the migrations this database hasn't recorded yet, in key order, and records each one. */
export async function runMigrations(db: Kysely<unknown>, list: Record<string, Migration> = migrations): Promise<void> {
  // Kysely's SQLite adapter reports no transactional DDL, so the Migrator opens no transaction; SQLite supports one.
  const wrapped = Object.fromEntries(Object.entries(list).map(([name, m]): [string, Migration] => [
    name,
    { up: (mdb) => mdb.transaction().execute((trx) => m.up(trx)) },
  ]));
  const migrator = new Migrator({ db, provider: { getMigrations: async () => wrapped } });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
