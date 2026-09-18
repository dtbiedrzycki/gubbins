import { DomainValidationError } from '../errors.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Any domain entity's identity. One type serves all of them: the ids share a
 * single invariant (UUID v4), and no signature in this domain takes two ids
 * of different kinds, so nominally branding them per entity guarded nothing
 * that could actually go wrong. Split a dedicated id class back out when one
 * needs an invariant the others don't.
 */
export class UuidId {
  private readonly _brand = 'UuidId' as const;

  private constructor(readonly value: string) {}

  static from(value: string): UuidId {
    if (!UUID_V4_PATTERN.test(value)) {
      throw new DomainValidationError('Id must be a valid UUID v4');
    }
    return new UuidId(value);
  }
}
