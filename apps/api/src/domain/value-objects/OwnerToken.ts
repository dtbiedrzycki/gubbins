import { DomainValidationError } from '../errors.js';

/**
 * The owner's bearer secret for a wishlist. Opaque — never trimmed or
 * normalised, since any transformation would change the credential.
 */
export class OwnerToken {
  private constructor(readonly value: string) {}

  static from(value: string): OwnerToken {
    if (value.length === 0) throw new DomainValidationError('Owner token must not be empty');
    return new OwnerToken(value);
  }

  /**
   * Compares this token against a candidate using the supplied comparer.
   * The comparer is taken as a structural type rather than an imported
   * interface: domain/ may not import application/ (ADR-012).
   */
  matches(candidate: string, comparer: { constantTimeEqual(a: string, b: string): boolean }): boolean {
    return comparer.constantTimeEqual(this.value, candidate);
  }
}
