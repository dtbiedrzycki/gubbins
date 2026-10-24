import type { Contribution } from '../../domain/entities/Contribution.js';

export interface ContributionRepository {
  insert(contribution: Contribution): Promise<void>;
  findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Contribution | null>;
  /**
   * Every contribution on the list's items, oldest pledge first: what the `Wishlist` aggregate loads.
   * A stable order (pledge time, then id), so every adapter hands the aggregate the same sequence.
   */
  findForWishlist(wishlistId: string): Promise<Contribution[]>;
  /** Sum of pledged amounts per item on the list; items with none are absent. Computed from the rows, never stored (D21). */
  pledgedTotals(wishlistId: string): Promise<Map<string, number>>;
}
