import { DomainValidationError } from '../errors.js';

/**
 * The guest bearer secret for a wishlist. Opaque — never trimmed or
 * normalised, since any transformation would change the credential.
 */
export class GuestKey {
  /**
   * Nominal-typing brand. The three bearer-secret VOs are otherwise
   * structurally identical, which would let TypeScript accept an
   * `OwnerToken` or `HoldSecret` wherever a `GuestKey` is expected — a
   * parameter swap would compile silently and surface only as a
   * wrong-permission bug. A private, literal-typed field makes the classes
   * mutually unassignable at zero runtime cost.
   */
  private readonly _brand = 'GuestKey' as const;

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
