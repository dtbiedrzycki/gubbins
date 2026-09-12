import SqliteDatabase from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.js';

export function createDb(path: string): Kysely<Database> {
  const sqlite = new SqliteDatabase(path);
  sqlite.pragma('journal_mode = WAL');
  // This environment's better-sqlite3 build is compiled with
  // SQLITE_DEFAULT_FOREIGN_KEYS=1, unlike the SQLite default (OFF).
  // The integration tests (and this skeleton generally) exercise
  // repositories independently without always inserting every parent
  // row first, so normalize to the standard SQLite default here.
  sqlite.pragma('foreign_keys = OFF');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}
