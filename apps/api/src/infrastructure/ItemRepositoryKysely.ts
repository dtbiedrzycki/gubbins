import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { ItemRepository, ItemRow } from '../application/ports/ItemRepository.js';
import type { Item } from '../domain/entities/Item.js';

export class ItemRepositoryKysely implements ItemRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(item: Item): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto('items').values({
      id: item.id.value, wishlist_id: item.wishlistId.value, type: item.type, title: item.title,
      quantity: item.quantity, url: item.url, price_minor: item.priceMinor, description: item.description, created_at: now,
    }).execute();
    await this.db.insertInto('item_state').values({
      item_id: item.id.value, seq: item.seq, updated_at: now,
    }).execute();
  }

  async findAllByWishlistId(wishlistId: string): Promise<ItemRow[]> {
    const rows = await this.db.selectFrom('items')
      .innerJoin('item_state', 'item_state.item_id', 'items.id')
      .selectAll('items')
      .select('item_state.seq as seq')
      .where('wishlist_id', '=', wishlistId)
      // created_at ties within a millisecond; monotonic v7 ids (ADR-0076) break the tie in insertion order.
      .orderBy('items.created_at').orderBy('items.id')
      .execute();
    return rows.map((row) => ({
      id: row.id, wishlistId: row.wishlist_id, type: row.type, title: row.title, quantity: row.quantity, url: row.url, priceMinor: row.price_minor, description: row.description,
      seq: row.seq,
    }));
  }

  async seqsByWishlistId(wishlistId: string): Promise<Map<string, number>> {
    const rows = await this.db.selectFrom('item_state')
      .innerJoin('items', 'items.id', 'item_state.item_id')
      .select(['item_state.item_id as id', 'item_state.seq as seq'])
      .where('items.wishlist_id', '=', wishlistId)
      .execute();
    return new Map(rows.map((row) => [row.id, row.seq]));
  }

  /** Writes `seq` only: the purchased count is derived from holds, never stored. */
  async saveState(item: Item): Promise<void> {
    await this.db.updateTable('item_state')
      .set({ seq: item.seq, updated_at: new Date().toISOString() })
      .where('item_id', '=', item.id.value)
      .execute();
  }
}
