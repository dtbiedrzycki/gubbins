import type { Wishlist } from '../../domain/entities/Wishlist.js';

/**
 * The aggregate's repository (ADR-0078): it loads and stores a `Wishlist`
 * together with its items and every hold and contribution on them, so
 * callers never assemble an aggregate from separate lookups.
 */
export interface WishlistRepository {
  /** Persists the wishlist along with its attached items and their state. */
  insert(wishlist: Wishlist): Promise<void>;
  /**
   * Loads the full aggregate as of `now` — its items and every hold and
   * contribution on the list, like its items (ADR-0078) — or null if no
   * such wishlist. The returned aggregate decides as of that instant: its
   * commands and status queries take no time argument, so load and
   * decision share `now`.
   */
  findBySlug(slug: string, now: Date): Promise<Wishlist | null>;
  findById(id: string, now: Date): Promise<Wishlist | null>;
  /**
   * Stores what the domain decided on a list already inserted: its title
   * and description as the domain left them, items it added, at their
   * `seq`, and each existing item's `seq` exactly as the domain left it,
   * with no arithmetic of its own; then holds it placed, and each of its
   * holds' lifecycle as the domain left it, then
   * contributions it pledged that are not yet stored. A contribution is
   * never updated. The purchased count is not written: the aggregate
   * counts it from the purchased holds it loads. Throws
   * WishlistNotFoundError unless the list exists.
   */
  save(wishlist: Wishlist): Promise<void>;
}
