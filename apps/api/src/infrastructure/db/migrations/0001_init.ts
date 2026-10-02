import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Kysely migration schema-builder typing is intentionally loose; see ADR-0072.
  const schema = db.schema as Kysely<any>['schema'];

  await schema.createTable('wishlists').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('owner_token', 'text', (col) => col.notNull())
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('key_gen', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('items').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('wishlist_id', 'text', (col) => col.notNull().references('wishlists.id'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('item_state').ifNotExists()
    .addColumn('item_id', 'text', (col) => col.primaryKey().references('items.id'))
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('active_holds', 'integer', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('holds').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('item_id', 'text', (col) => col.notNull().references('items.id'))
    .addColumn('secret', 'text', (col) => col.notNull())
    .addColumn('session_hash', 'text', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull())
    // Every instant below is written with toISOString(), so text comparison
    // is time order — findActiveForWishlist relies on it.
    .addColumn('expires_at', 'text', (col) => col.notNull())
    // Hold state is timestamps only; statusAt(now) derives active/expired/
    // released/purchased from them (holds-lifecycle D5).
    .addColumn('extended_at', 'text')
    .addColumn('released_at', 'text')
    .addColumn('purchased_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('holds_item_idempotency_key_unique', ['item_id', 'idempotency_key'])
    // A hold ends one way or the other, never both. A backstop: the domain
    // already refuses it (holds-lifecycle §2, D9).
    .addCheckConstraint('holds_released_or_purchased', sql`released_at IS NULL OR purchased_at IS NULL`)
    .execute();

  await schema.createIndex('holds_item_id_idx').ifNotExists().on('holds').column('item_id').execute();
  await schema.createIndex('holds_session_hash_idx').ifNotExists().on('holds').column('session_hash').execute();

  await schema.createTable('event_log').ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('item_id', 'text', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('event_type', 'text', (col) => col.notNull())
    // Envelope metadata, not payload (ADR-0075): the role whose credential
    // authorised the command. No `system` role exists; adding one needs an
    // ADR and a migration that widens this check.
    .addColumn('actor', 'text', (col) => col.notNull().check(sql`actor IN ('guest', 'owner')`))
    .addColumn('payload', 'text', (col) => col.notNull())
    .addColumn('recorded_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('event_log_item_seq_unique', ['item_id', 'seq'])
    .execute();
}
