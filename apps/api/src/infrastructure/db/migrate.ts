import { createDb } from './createDb.js';
import { up } from './migrations/0001_init.js';
import type { Database } from './schema.js';
import type { Kysely } from 'kysely';

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await up(db as unknown as Kysely<unknown>);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const path = process.env.DATABASE_PATH ?? './data/wishlist.db';
  const db = createDb(path);
  migrateToLatest(db)
    .then(async () => { console.log('Migration complete.'); await db.destroy(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
