import { DomainValidationError } from '../errors.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A wishlist's identity. Branded separately from ItemId/HoldId so a value
 * meant for a different entity can't be passed where a WishlistId is
 * expected and compile silently (same rationale as the bearer-secret VOs).
 */
export class WishlistId {
  private readonly _brand = 'WishlistId' as const;

  private constructor(readonly value: string) {}

  static from(value: string): WishlistId {
    if (!UUID_V4_PATTERN.test(value)) {
      throw new DomainValidationError('WishlistId must be a valid UUID v4');
    }
    return new WishlistId(value);
  }
}
