import type { Item } from '../../domain/entities/Item.js';

/** An item's stored columns; the WishlistRepository adds its holds, contributions and asOf when it builds the Item. */
export type ItemRow = {
  id: string; wishlistId: string; type: string; title: string; quantity: number;
  url: string | null; priceMinor: number | null; description: string | null; seq: number;
};

/**
 * Not a use-case-facing port: use cases reach an item only through the
 * `Wishlist` aggregate (ADR-0078). This is the collaborator a
 * `WishlistRepository` implementation assembles that aggregate from, which
 * is why it is absent from `TransactionContext`.
 */
export interface ItemRepository {
  insert(item: Item): Promise<void>;
  /** The list's item rows, in the order they were added; the `WishlistRepository` assembles them into Items. */
  findAllByWishlistId(wishlistId: string): Promise<ItemRow[]>;
  /** Writes the item's editable columns: title, quantity, url, price and description. */
  update(item: Item): Promise<void>;
  /** Deletes the item's state row, then the item; the foreign keys from holds and contributions refuse an item with those rows; `event_log` has none, so callers check `seq` first. */
  delete(itemId: string): Promise<void>;
  /** Writes the item's `seq`; `WishlistRepository.save` calls it for each changed item. */
  saveState(item: Item): Promise<void>;
}
