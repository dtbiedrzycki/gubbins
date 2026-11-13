import { sql, type Kysely } from 'kysely';

/** Each list stores its style; existing lists keep the Storybook look. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table wishlists add column theme text not null default 'storybook'`.execute(db);
}
