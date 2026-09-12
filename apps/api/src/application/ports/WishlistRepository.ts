import type { Wishlist } from '../../domain/entities/Wishlist.js';

export interface WishlistRepository {
  insert(wishlist: Wishlist): Promise<void>;
  findBySlug(slug: string): Promise<Wishlist | null>;
}
