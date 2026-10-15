import type { Hold } from '../../domain/entities/Hold.js';

/**
 * The `Wishlist` repository's collaborator for hold rows (ADR-0078), not a
 * use-case-facing port. Every method's behaviour is pinned by
 * `holdRepository.contract.ts` against every implementation.
 */
export interface HoldRepository {
  insert(hold: Hold): Promise<void>;
  /** Persists the hold's lifecycle — expiry and its extended/released/purchased instants — as the domain left them. */
  save(hold: Hold): Promise<void>;
  /** Every hold on the list's items, whatever its state, oldest expiry first: what the `Wishlist` aggregate loads. */
  findForWishlist(wishlistId: string): Promise<Hold[]>;
}
