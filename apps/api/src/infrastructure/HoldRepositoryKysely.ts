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
 * `Z`) and string comparison in SQL is time order — findActiveOrPurchasedForWishlist
 * depends on that.
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

  async findById(holdId: string): Promise<Hold | null> {
    const row = await this.db.selectFrom('holds').selectAll().where('id', '=', holdId).executeTakeFirst();
    return row ? toHold(row) : null;
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Hold | null> {
    const row = await this.db.selectFrom('holds').selectAll()
      .where('item_id', '=', itemId).where('idempotency_key', '=', idempotencyKey).executeTakeFirst();
    return row ? toHold(row) : null;
  }

  async findActiveOrPurchasedForWishlist(wishlistId: string, now: Date): Promise<Hold[]> {
    const rows = await this.db.selectFrom('holds')
      .innerJoin('items', 'items.id', 'holds.item_id')
      .selectAll('holds')
      .where('items.wishlist_id', '=', wishlistId)
      .where((eb) => eb.or([
        eb('holds.purchased_at', 'is not', null),
        // Active means now <= expiresAt — still active at the very instant it
        // expires — so the boundary row is included.
        eb.and([eb('holds.released_at', 'is', null), eb('holds.expires_at', '>=', now.toISOString())]),
      ]))
      .orderBy('holds.expires_at')
      .execute();
    return rows.map(toHold);
  }

  async findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]> {
    const rows = await this.db.selectFrom('holds')
      .innerJoin('items', 'items.id', 'holds.item_id')
      .selectAll('holds')
      .where('items.wishlist_id', '=', wishlistId)
      .where('holds.session_hash', '=', sessionHash)
      .orderBy('holds.expires_at')
      .execute();
    return rows.map(toHold);
  }
}
