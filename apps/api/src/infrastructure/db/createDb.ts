import SqliteDatabase from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.js';

export function createDb(path: string): Kysely<Database> {
  const sqlite = new SqliteDatabase(path);
  sqlite.pragma('journal_mode = WAL');
  // Enforce referential integrity explicitly rather than relying on
  // whatever a given better-sqlite3 build's compiled-in default happens
  // to be (it varies by build) — the schema's foreign keys must be
  // real constraints the database checks, not just documentation.
  sqlite.pragma('foreign_keys = ON');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}
