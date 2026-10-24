import type { Hold } from '../../domain/entities/Hold.js';

/**
 * Holds in domain terms: no rows, no SQL vocabulary.
 * Every method's behaviour, including the expiry boundary, is pinned by
 * application/ports/contracts/holdRepository.contract.ts against every
 * implementation.
 */
export interface HoldRepository {
  /** Use cases persist holds through `WishlistRepository.save`, which calls this and `save`. */
  insert(hold: Hold): Promise<void>;
  /** Persists the hold's lifecycle — expiry and its extended/released/purchased instants — as the domain left them. */
  save(hold: Hold): Promise<void>;
  /** Any hold, whatever its state; null for an unknown (or malformed) id. Callers must still check the hold is on their list. */
  findById(holdId: string): Promise<Hold | null>;
  findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Hold | null>;
  /**
   * The list's holds active or purchased at `now` — purchased, or not
   * released and `now <= expiresAt` — and no others. Expired holds are never
   * closed under lazy expiry, so "every unclosed hold" would grow without
   * bound; the `Wishlist` loaded at `now` re-checks each one at that instant.
   * Active and purchased holds on an item never exceed its quantity, so
   * what this returns is bounded by the quantity.
   */
  findActiveOrPurchasedForWishlist(wishlistId: string, now: Date): Promise<Hold[]>;
  /**
   * Every hold on the list's items, whatever its state, oldest expiry first: what the `Wishlist` aggregate loads.
   * A stable order (expiry, then id), so every adapter hands the aggregate the same sequence.
   */
  findForWishlist(wishlistId: string): Promise<Hold[]>;
  /** Every hold `sessionHash` placed on the list, whatever its state, for "Your holds" — expired ones included, since an expired hold can still be purchased. */
  findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]>;
}
