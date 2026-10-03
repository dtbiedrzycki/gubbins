import type { Hold } from '../../domain/entities/Hold.js';

/**
 * Holds in domain terms: no rows, no SQL vocabulary.
 * Every method's behaviour, including the expiry boundary, is pinned by
 * application/ports/contracts/holdRepository.contract.ts against every
 * implementation.
 */
export interface HoldRepository {
  insert(hold: Hold): Promise<void>;
  /** Persists the hold's lifecycle — expiry and its extended/released/purchased instants — as the domain left them. */
  save(hold: Hold): Promise<void>;
  /** Any hold, whatever its state; null for an unknown (or malformed) id. Callers must still check the hold is on their list. */
  findById(holdId: string): Promise<Hold | null>;
  findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Hold | null>;
  /**
   * The list's holds active at `now` — not released, not purchased, and
   * `now <= expiresAt` — and no others. Expired holds are never
   * closed under lazy expiry, so "every unclosed hold" would grow without
   * bound; the domain re-checks each one with `statusAt(now)`.
   */
  findActiveForWishlist(wishlistId: string, now: Date): Promise<Hold[]>;
  /** Every hold `sessionHash` placed on the list, whatever its state, for "Your holds" — expired ones included, since an expired hold can still be purchased. */
  findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]>;
}
