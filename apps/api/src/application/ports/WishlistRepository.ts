import type { Wishlist } from '../../domain/entities/Wishlist.js';

/**
 * The aggregate's repository: it loads and stores a `Wishlist` together with
 * the item it owns, so callers never assemble an aggregate from separate
 * lookups.
 */
export interface WishlistRepository {
  /** Persists the wishlist along with its attached item and that item's state. */
  insert(wishlist: Wishlist): Promise<void>;
  /** Loads the full aggregate — item included — or null if no such wishlist. */
  findBySlug(slug: string): Promise<Wishlist | null>;
  /** As findBySlug, for callers that only hold a wishlist id. */
  findById(id: string): Promise<Wishlist | null>;
  /**
   * Records a hold against the wishlist's item: bumps its stored seq to
   * `newSeq` and marks it held. Scoped by `wishlistId` so a caller can never
   * mark an item outside the wishlist it is authorized for.
   */
  markItemHeld(wishlistId: string, itemId: string, newSeq: number): Promise<void>;
}
