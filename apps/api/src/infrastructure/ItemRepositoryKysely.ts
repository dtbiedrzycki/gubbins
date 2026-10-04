import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { ItemRepository } from '../application/ports/ItemRepository.js';
import { Item } from '../domain/entities/Item.js';
import { ItemNotFoundError } from '../domain/errors.js';

export class ItemRepositoryKysely implements ItemRepository {
  constructor(private db: Kysely<Database>) {}

  async insert(item: Item): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insertInto('items').values({
      id: item.id.value, wishlist_id: item.wishlistId.value, type: item.type, title: item.title,
      quantity: item.quantity, created_at: now,
    }).execute();
    await this.db.insertInto('item_state').values({
      item_id: item.id.value, seq: item.seq, updated_at: now,
    }).execute();
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    const row = await this.db.selectFrom('items')
      .innerJoin('item_state', 'item_state.item_id', 'items.id')
      .selectAll('items')
      .select('item_state.seq as seq')
      .where('wishlist_id', '=', wishlistId)
      .executeTakeFirst();
    if (!row) return null;
    return Item.reconstitute({
      id: row.id, wishlistId: row.wishlist_id, type: row.type, title: row.title, quantity: row.quantity,
      seq: row.seq,
    });
  }

  /** Writes `seq` only: the purchased count is derived from holds, never stored. */
  async saveState(item: Item): Promise<void> {
    const result = await this.db.updateTable('item_state')
      .set({ seq: item.seq, updated_at: new Date().toISOString() })
      .where('item_id', '=', item.id.value)
      // Scoped by wishlist as well as id: a write lands only on an item of
      // the list the aggregate was loaded for.
      .where('item_id', 'in', this.db.selectFrom('items').select('items.id').where('items.wishlist_id', '=', item.wishlistId.value))
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw new ItemNotFoundError(item.id.value);
  }
}
