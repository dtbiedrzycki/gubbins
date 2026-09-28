import { DomainValidationError } from '../errors.js';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Any domain entity's identity. One type serves all of them: the ids share a
 * single invariant (UUID v7), and no *runtime* check in this domain ever
 * had to distinguish one entity's id from another's, so nominally branding
 * them per entity guarded nothing that could actually go wrong at that
 * level. This does not mean no signature takes two ids of different kinds —
 * `Item`'s private constructor takes `(id, wishlistId, …)` positionally and
 * adjacently, so a transposition would compile — only that the two ids are
 * interchangeable as far as *this* type's own invariant goes. Split a
 * dedicated id class back out when one needs an invariant the others don't,
 * or when that positional risk needs closing off.
 *
 * v7 rather than v4 per ADR-0076: ids are database keys the domain mints
 * itself, and v7 sorts by creation time. The check is deliberately on the
 * version nibble — a v4 is rejected here, which is what makes a generator
 * that quietly produces the wrong version fail loudly rather than drift.
 */
export class UuidId {
  private readonly _brand = 'UuidId' as const;

  private constructor(readonly value: string) {}

  static from(value: string): UuidId {
    if (!UUID_V7_PATTERN.test(value)) {
      throw new DomainValidationError('Id must be a valid UUID v7');
    }
    return new UuidId(value);
  }
}
