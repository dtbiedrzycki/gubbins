import SqliteDatabase from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.js';

export interface CreateDbOptions {
  /**
   * How long a connection waits for another's write lock before failing
   * with SQLITE_BUSY. better-sqlite3's own default is 5000 ms. The wait is
   * synchronous, so it only helps against *another process*; within one
   * process every transaction already queues on the single connection.
   */
  busyTimeoutMs?: number;
}

export function createDb(path: string, options: CreateDbOptions = {}): Kysely<Database> {
  const sqlite = new SqliteDatabase(path, { timeout: options.busyTimeoutMs ?? 5000 });
  sqlite.pragma('journal_mode = WAL');
  // Enforce referential integrity explicitly rather than relying on
  // whatever a given better-sqlite3 build's compiled-in default happens
  // to be (it varies by build) — the schema's foreign keys must be
  // real constraints the database checks, not just documentation.
  sqlite.pragma('foreign_keys = ON');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}
