import type { Contribution } from '../../domain/entities/Contribution.js';

/**
 * The `Wishlist` repository's collaborator for contribution rows (ADR-0078),
 * not a use-case-facing port. Every method's behaviour is pinned by
 * `contributionRepository.contract.ts` against every implementation.
 */
export interface ContributionRepository {
  insert(contribution: Contribution): Promise<void>;
  /** Every contribution on the list's items, oldest pledge first: what the `Wishlist` aggregate loads. */
  findForWishlist(wishlistId: string): Promise<Contribution[]>;
}
