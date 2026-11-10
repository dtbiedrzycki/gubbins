import { sql, type Kysely } from 'kysely';

/** Each item stores its place in its list; existing lists keep the order they had, oldest first. */
export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite can only add a NOT NULL column with a default; the update below replaces every 0.
  await sql`alter table items add column position integer not null default 0`.execute(db);
  await sql`update items set position = (
    select count(*) from items o
    -- same order as the old load: created_at, then id
    where o.wishlist_id = items.wishlist_id
      and (o.created_at < items.created_at or (o.created_at = items.created_at and o.id < items.id))
  )`.execute(db);
}
