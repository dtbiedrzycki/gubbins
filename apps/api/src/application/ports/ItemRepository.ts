import type { Item } from '../../domain/entities/Item.js';

export interface ItemState {
  seq: number;
  activeHolds: number;
  status: 'available' | 'held';
}

export interface ItemRepository {
  insert(item: Item): Promise<void>;
  findById(id: string): Promise<Item | null>;
  findByWishlistId(wishlistId: string): Promise<Item | null>;
  /**
   * Like findById, but scoped to a wishlist: returns null if the item
   * doesn't exist OR belongs to a different wishlist. Callers that already
   * hold a validated wishlist context (e.g. a route acting on a guest
   * session) should use this instead of findById, so a caller can never
   * accidentally act on an item outside the wishlist it's authorized for.
   */
  findInWishlist(wishlistId: string, itemId: string): Promise<Item | null>;
  getState(itemId: string): Promise<ItemState>;
  markHeld(itemId: string, newSeq: number): Promise<void>;
}
