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
    .addColumn('venmo_handle', 'text')
    .addColumn('zelle_handle', 'text')
    // One currency per list (ADR-0006); every list is USD until a picker exists, so nothing reads it yet.
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('USD'))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('items').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('wishlist_id', 'text', (col) => col.notNull().references('wishlists.id'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('url', 'text')
    .addColumn('price_minor', 'integer')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addCheckConstraint('items_type_known', sql`type IN ('single', 'group')`)
    // A group gift is priced and is one gift, not a count. A backstop: the domain already refuses it.
    .addCheckConstraint('items_group_priced_single_quantity', sql`type = 'single' OR (price_minor IS NOT NULL AND quantity = 1)`)
    .execute();

  await schema.createTable('item_state').ifNotExists()
    .addColumn('item_id', 'text', (col) => col.primaryKey().references('items.id'))
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  await schema.createTable('holds').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('item_id', 'text', (col) => col.notNull().references('items.id'))
    .addColumn('secret', 'text', (col) => col.notNull())
    .addColumn('session_hash', 'text', (col) => col.notNull())
    .addColumn('idempotency_key', 'text', (col) => col.notNull())
    // Every instant below is written with toISOString(), so text comparison
    // is time order — findActiveOrPurchasedForWishlist relies on it.
    .addColumn('expires_at', 'text', (col) => col.notNull())
    // Hold state is timestamps only; statusAt(at) derives active/expired/
    // released/purchased from them.
    .addColumn('extended_at', 'text')
    .addColumn('released_at', 'text')
    .addColumn('purchased_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('holds_item_idempotency_key_unique', ['item_id', 'idempotency_key'])
    // A hold ends one way or the other, never both. A backstop: the domain
    // already refuses it.
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

  // Outside the ledger and rebuildProjections on purpose: PII must stay erasable (ADR-0057).
  await schema.createTable('guest_pii').ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    // Backstop for the 300-character message limit; the domain is the rule's owner.
    .addColumn('message', 'text', (col) => col.check(sql`message IS NULL OR length(message) <= 300`))
    // Set when a guest's details are erased (ADR-0057); no erasure path writes it yet.
    .addColumn('redacted_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();
}
