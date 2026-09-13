import type { Item } from '../../domain/entities/Item.js';

export interface ItemState {
  seq: number;
  activeHolds: number;
  status: 'available' | 'held';
}

/**
 * Not a use-case-facing port: use cases reach an item only through the
 * `Wishlist` aggregate that owns it. This is the internal collaborator a
 * `WishlistRepository` implementation assembles that aggregate from, which is
 * why it is absent from `TransactionContext`.
 */
export interface ItemRepository {
  insert(item: Item): Promise<void>;
  findByWishlistId(wishlistId: string): Promise<Item | null>;
  /**
   * An item lookup scoped to a wishlist: returns null if the item doesn't
   * exist OR belongs to a different wishlist. Used by
   * `WishlistRepository.markItemHeld`, so a write can never land on an item
   * outside the wishlist the aggregate was loaded for.
   */
  findInWishlist(wishlistId: string, itemId: string): Promise<Item | null>;
  getState(itemId: string): Promise<ItemState>;
  markHeld(itemId: string, newSeq: number): Promise<void>;
}
