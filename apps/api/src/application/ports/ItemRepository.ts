import type { Item } from '../../domain/entities/Item.js';

/** An item's stored columns; the WishlistRepository adds its holds, contributions and asOf when it builds the Item. */
export type ItemRow = {
  id: string; wishlistId: string; type: string; title: string; quantity: number;
  url: string | null; priceMinor: number | null; seq: number;
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
  /** Each item's stored `seq`, by item id: what `save` compares against. */
  seqsByWishlistId(wishlistId: string): Promise<Map<string, number>>;
  /** Writes the item's `seq`; `WishlistRepository.save` calls it for each changed item. */
  saveState(item: Item): Promise<void>;
}
