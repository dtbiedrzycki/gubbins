import { sql, type Kysely } from 'kysely';

// The guest's message now comes with marking a gift purchased, so messages stored on holds are deleted. Pledge messages are kept. Data only: no schema change, no way back.
// Ship it in the same release as the change that collects the message at purchase: run later, it would also delete messages guests wrote at purchase.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`update guest_pii set message = null where id in (select pii_ref from holds where pii_ref is not null)`.execute(db);
}
