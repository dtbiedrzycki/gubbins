import { sql, type Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';

/**
 * Owner payment handles are owner PII, one `owner_pii` row per record
 * (ADR-0090): the list references its Venmo and Zelle rows, and a pledge
 * references the row of the handle it was paid to.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Kysely migration schema-builder typing is intentionally loose; see ADR-0072.
  const schema = db.schema as Kysely<any>['schema'];

  await schema.createTable('owner_pii')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('wishlist_id', 'text', (col) => col.notNull().references('wishlists.id'))
    .addColumn('method', 'text', (col) => col.notNull().check(sql`method IN ('venmo', 'zelle')`))
    .addColumn('handle', 'text', (col) => col.notNull())
    .addColumn('redacted_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();
  await sql`alter table wishlists add column venmo_owner_pii_ref text references owner_pii(id)`.execute(db);
  await sql`alter table wishlists add column zelle_owner_pii_ref text references owner_pii(id)`.execute(db);
  await sql`alter table contributions add column owner_pii_ref text references owner_pii(id)`.execute(db);

  const lists = (await sql<{ id: string; venmo_handle: string | null; zelle_handle: string | null }>`
    select id, venmo_handle, zelle_handle from wishlists where venmo_handle is not null or zelle_handle is not null`.execute(db)).rows;
  const createdAt = new Date().toISOString();
  for (const list of lists) {
    for (const [method, handle] of [['venmo', list.venmo_handle], ['zelle', list.zelle_handle]] as const) {
      if (handle === null) continue;
      const id = uuidv7(); // ADR-0076; the domain mints these for new lists
      await sql`insert into owner_pii (id, wishlist_id, method, handle, redacted_at, created_at) values (${id}, ${list.id}, ${method}, ${handle}, null, ${createdAt})`.execute(db);
      await sql`update wishlists set ${sql.ref(`${method}_owner_pii_ref`)} = ${id} where id = ${list.id}`.execute(db);
    }
  }
  await sql`alter table wishlists drop column venmo_handle`.execute(db);
  await sql`alter table wishlists drop column zelle_handle`.execute(db);
}
