import type { Kysely, Selectable } from 'kysely';
import type { Database, HoldsTable } from './db/schema.js';
import type { HoldRepository } from '../application/ports/HoldRepository.js';
import { Hold } from '../domain/entities/Hold.js';

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function toHold(row: Selectable<HoldsTable>): Hold {
  return Hold.reconstitute({
    id: row.id, itemId: row.item_id, secret: row.secret, sessionHash: row.session_hash,
    idempotencyKey: row.idempotency_key, expiresAt: new Date(row.expires_at),
    extendedAt: toDate(row.extended_at), releasedAt: toDate(row.released_at), purchasedAt: toDate(row.purchased_at),
    piiRef: row.pii_ref,
  });
}

/**
 * The lifecycle columns as the domain left them. Every instant goes through
 * toISOString(), so the stored text has one fixed shape (UTC, milliseconds,
 * `Z`) and sorting it as text is time order, which `findForWishlist`'s
 * order by `expires_at` relies on.
 */
export function lifecycleColumns(hold: Hold) {
  return {
    expires_at: hold.expiresAt.toISOString(),
    extended_at: hold.extendedAt?.toISOString() ?? null,
    released_at: hold.releasedAt?.toISOString() ?? null,
    purchased_at: hold.purchasedAt?.toISOString() ?? null,
  };
}

export class HoldRepositoryKysely implements HoldRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(hold: Hold): Promise<void> {
    await this.db.insertInto('holds').values({
      id: hold.id.value, item_id: hold.itemId.value, secret: hold.secret.value, session_hash: hold.sessionHash.value,
      idempotency_key: hold.idempotencyKey.value, pii_ref: hold.piiRef?.value ?? null, ...lifecycleColumns(hold), created_at: new Date().toISOString(),
    }).execute();
  }

  async save(hold: Hold): Promise<void> {
    const result = await this.db.updateTable('holds').set(lifecycleColumns(hold)).where('id', '=', hold.id.value).executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw new Error(`No hold ${hold.id.value} to save`);
  }

  async findForWishlist(wishlistId: string): Promise<Hold[]> {
    const rows = await this.db.selectFrom('holds')
      .innerJoin('items', 'items.id', 'holds.item_id')
      .selectAll('holds')
      .where('items.wishlist_id', '=', wishlistId)
      .orderBy('holds.expires_at').orderBy('holds.id')
      .execute();
    return rows.map(toHold);
  }
}
