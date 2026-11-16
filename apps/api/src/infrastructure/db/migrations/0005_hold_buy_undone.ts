import { sql, type Kysely } from 'kysely';

/**
 * A guest can undo a buy; the hold records when. A column CHECK, because
 * SQLite can't add a table constraint to an existing table; structural only
 * (ADR-0083): an undo needs a buy to undo.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table holds add column buy_undone_at text check (buy_undone_at is null or purchased_at is not null)`.execute(db);
}
