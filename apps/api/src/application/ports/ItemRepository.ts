import type { Item } from '../../domain/entities/Item.js';

/**
 * Not a use-case-facing port: use cases reach an item only through the
 * `Wishlist` aggregate (ADR-0078). This is the collaborator a
 * `WishlistRepository` implementation assembles that aggregate from, which
 * is why it is absent from `TransactionContext`.
 */
export interface ItemRepository {
  insert(item: Item): Promise<void>;
  findByWishlistId(wishlistId: string): Promise<Item | null>;
  /**
   * Purchased holds per item id for the list's items, computed from the
   * holds themselves and never stored; an item with none has no entry.
   */
  purchasedCountsByItem(wishlistId: string): Promise<ReadonlyMap<string, number>>;
  /** See `WishlistRepository.saveItemState`, which delegates here. */
  saveState(item: Item): Promise<void>;
}
