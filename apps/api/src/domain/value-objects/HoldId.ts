import { DomainValidationError } from '../errors.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A hold's identity. Branded separately from WishlistId/ItemId so a value
 * meant for a different entity can't be passed where a HoldId is expected
 * and compile silently (same rationale as the bearer-secret VOs).
 */
export class HoldId {
  private readonly _brand = 'HoldId' as const;

  private constructor(readonly value: string) {}

  static from(value: string): HoldId {
    if (!UUID_V4_PATTERN.test(value)) {
      throw new DomainValidationError('HoldId must be a valid UUID v4');
    }
    return new HoldId(value);
  }
}
