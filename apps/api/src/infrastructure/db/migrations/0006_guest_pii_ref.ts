import { sql, type Kysely } from 'kysely';

/**
 * The column names the guest's details, so a reference to the owner's
 * details can sit beside it. SQLite rewrites the foreign keys that name the
 * column.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table holds rename column pii_ref to guest_pii_ref`.execute(db);
  await sql`alter table contributions rename column pii_ref to guest_pii_ref`.execute(db);
}
