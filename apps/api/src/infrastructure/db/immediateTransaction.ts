import { sql, type Kysely } from 'kysely';
import type { Database } from './schema.js';

/**
 * Runs `fn` in a transaction opened with BEGIN IMMEDIATE, which takes
 * SQLite's write lock up front instead of at the first write. Kysely's own
 * `transaction()` issues a plain, deferred `begin`, under which two writers
 * can both read, both decide, and only discover each other when one writes
 * — the read-then-append window that availability and the hold cap
 * (ADR-0046) must not have (backend architecture: "BEGIN IMMEDIATE
 * serializes the read-then-append"). Pinned to one connection, as a
 * transaction must be.
 */
export async function inImmediateTransaction<T>(db: Kysely<Database>, fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  return db.connection().execute(async (conn) => {
    await sql`begin immediate`.execute(conn);
    try {
      const result = await fn(conn);
      await sql`commit`.execute(conn);
      return result;
    } catch (err) {
      await sql`rollback`.execute(conn);
      throw err;
    }
  });
}
