import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { ItemRepository } from '../application/ports/ItemRepository.js';
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
      item_id: item.id.value, seq: item.seq, active_holds: item.activeHolds, status: item.status, updated_at: now,
    }).execute();
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items')
      .innerJoin('item_state', 'item_state.item_id', 'items.id')
      .selectAll('items')
      .select(['item_state.seq as seq', 'item_state.active_holds as active_holds'])
      .where('wishlist_id', '=', wishlistId)
      .executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({
      id: row.id, wishlistId: row.wishlist_id, title: row.title, seq: row.seq, activeHolds: row.active_holds,
    });
  }

  async findInWishlist(wishlistId: string, itemId: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items')
      .innerJoin('item_state', 'item_state.item_id', 'items.id')
      .selectAll('items')
      .select(['item_state.seq as seq', 'item_state.active_holds as active_holds'])
      .where('items.id', '=', itemId)
      .where('wishlist_id', '=', wishlistId)
      .executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({
      id: row.id, wishlistId: row.wishlist_id, title: row.title, seq: row.seq, activeHolds: row.active_holds,
    });
  }

  async markHeld(itemId: string, newSeq: number): Promise<void> {
    // The port only gives us newSeq: activeHolds isn't part of the port's
    // contract (it lives on the domain Item, not this write), so we read the
    // current row to bump it. This stays private to the Kysely adapter — the
    // port itself has no read-before-write step.
    const current = await this.db.selectFrom('item_state').select('active_holds')
      .where('item_id', '=', itemId).executeTakeFirst();
    if (!current) throw new Error(`No state for item ${itemId}`);
    await this.db.updateTable('item_state')
      .set({ seq: newSeq, active_holds: current.active_holds + 1, status: 'held', updated_at: new Date().toISOString() })
      .where('item_id', '=', itemId)
      .execute();
  }
}
