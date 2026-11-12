import { sql, type Kysely } from 'kysely';

/** Loading a list's items filters by wishlist and sorts by position. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create index items_wishlist_position on items(wishlist_id, position)`.execute(db);
}
