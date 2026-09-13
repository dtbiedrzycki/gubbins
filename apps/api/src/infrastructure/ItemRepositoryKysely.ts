import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { ItemRepository, ItemState } from '../application/ports/ItemRepository.js';
import { Item } from '../domain/entities/Item.js';

export class ItemRepositoryKysely implements ItemRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(item: Item): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto('items').values({
      id: item.id.value, wishlist_id: item.wishlistId.value, type: item.type, title: item.title,
      quantity: item.quantity, created_at: now,
    }).execute();
    await this.db.insertInto('item_state').values({
      item_id: item.id.value, seq: 0, active_holds: 0, status: 'available', updated_at: now,
    }).execute();
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items').selectAll().where('wishlist_id', '=', wishlistId).executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({ id: row.id, wishlistId: row.wishlist_id, title: row.title });
  }

  async findInWishlist(wishlistId: string, itemId: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items').selectAll()
      .where('id', '=', itemId)
      .where('wishlist_id', '=', wishlistId)
      .executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({ id: row.id, wishlistId: row.wishlist_id, title: row.title });
  }

  async getState(itemId: string): Promise<ItemState> {
    const row = await this.db.selectFrom('item_state').selectAll().where('item_id', '=', itemId).executeTakeFirst();
    if (!row) throw new Error(`No state for item ${itemId}`);
    return { seq: row.seq, activeHolds: row.active_holds, status: row.status as 'available' | 'held' };
  }

  async markHeld(itemId: string, newSeq: number): Promise<void> {
    const current = await this.getState(itemId);
    await this.db.updateTable('item_state')
      .set({ seq: newSeq, active_holds: current.activeHolds + 1, status: 'held', updated_at: new Date().toISOString() })
      .where('item_id', '=', itemId)
      .execute();
  }
}
