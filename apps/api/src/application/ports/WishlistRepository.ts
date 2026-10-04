import type { Item } from '../../domain/entities/Item.js';
import type { Wishlist } from '../../domain/entities/Wishlist.js';

/**
 * The aggregate's repository (ADR-0078): it loads and stores a `Wishlist`
 * together with its item and the list's active or purchased holds, so callers never
 * assemble an aggregate from separate lookups.
 */
export interface WishlistRepository {
  /** Persists the wishlist along with its attached item and that item's state. */
  insert(wishlist: Wishlist): Promise<void>;
  /**
   * Loads the full aggregate as of `now` — its item and every hold on the
   * list active or purchased at `now` — or null if no such wishlist. The returned
   * aggregate decides as of that instant: its commands and status queries
   * take no time argument, so load and decision share `now`.
   */
  findBySlug(slug: string, now: Date): Promise<Wishlist | null>;
  findById(id: string, now: Date): Promise<Wishlist | null>;
  /**
   * Writes an item's `seq` exactly as the domain left it — no
   * read-before-write, no arithmetic of its own. The
   * purchased count is not written: the aggregate counts it from the purchased holds it loads.
   * Throws ItemNotFoundError unless the item exists on
   * `item.wishlistId`.
   */
  saveItemState(item: Item): Promise<void>;
}
