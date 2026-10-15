import type { Item } from '../../domain/entities/Item.js';

/**
 * Not a use-case-facing port: use cases reach an item only through the
 * `Wishlist` aggregate (ADR-0078). This is the collaborator a
 * `WishlistRepository` implementation assembles that aggregate from, which
 * is why it is absent from `TransactionContext`.
 */
export interface ItemRepository {
  insert(item: Item): Promise<void>;
  /** In the order they were added. */
  findAllByWishlistId(wishlistId: string): Promise<Item[]>;
  /** See `WishlistRepository.saveItemState`, which delegates here. */
  saveState(item: Item): Promise<void>;
}
