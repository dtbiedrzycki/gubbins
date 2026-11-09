import type { Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import { migrations } from './migrations/index.js';

/**
 * Runs the migrations this database hasn't recorded yet, in key order, and
 * records each one, all in one transaction (see createDb's adapter).
 */
export async function runMigrations(db: Kysely<unknown>, list: Record<string, Migration> = migrations): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => list } });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
