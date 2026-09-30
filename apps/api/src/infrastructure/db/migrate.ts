import { pathToFileURL } from 'node:url';
import { createDb } from './createDb.js';
import { up } from './migrations/0001_init.js';
import type { Database } from './schema.js';
import type { Kysely } from 'kysely';

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await up(db as unknown as Kysely<unknown>);
}

/**
 * This module is both a library and a CLI: `migrateToLatest` is imported by
 * the integration tests and by the server's startup path, while `npm run
 * migrate` executes the file directly. Without this guard, the block below —
 * which opens a database at `DATABASE_PATH` and migrates it — would run as a
 * side effect of every one of those imports, so a test importing the function
 * would first migrate `./data/wishlist.db` on the developer's machine.
 *
 * It is the ESM equivalent of CommonJS's `require.main === module`, which has
 * no direct counterpart: comparing this module's own URL against the entry
 * path in `process.argv[1]` is the standard substitute. `pathToFileURL` does
 * that conversion properly — a hand-built `file://${process.argv[1]}` string
 * fails to match for any path needing percent-encoding (a space in a
 * directory name is enough), which would silently turn `npm run migrate` into
 * a no-op.
 */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const path = process.env.DATABASE_PATH ?? './data/wishlist.db';
  const db = createDb(path);
  try {
    await migrateToLatest(db);
    console.log('Migration complete.');
  } catch (err) {
    console.error(err);
    // Set the exit code rather than calling process.exit, so the `finally`
    // below actually runs and the database is closed on the failure path too.
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
