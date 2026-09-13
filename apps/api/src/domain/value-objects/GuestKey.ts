import { DomainValidationError } from '../errors.js';

/**
 * The guest bearer secret for a wishlist. Opaque — never trimmed or
 * normalised, since any transformation would change the credential.
 */
export class GuestKey {
  private constructor(readonly value: string) {}

  static from(value: string): GuestKey {
    if (value.length === 0) throw new DomainValidationError('Guest key must not be empty');
    return new GuestKey(value);
  }

  /**
   * Compares this key against a candidate using the supplied comparer.
   * The comparer is taken as a structural type rather than an imported
   * interface: domain/ may not import application/ (ADR-012).
   */
  matches(candidate: string, comparer: { constantTimeEqual(a: string, b: string): boolean }): boolean {
    return comparer.constantTimeEqual(this.value, candidate);
  }
}
