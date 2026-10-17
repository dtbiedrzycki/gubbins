import { DomainValidationError } from '../errors.js';

/**
 * The owner's bearer secret for a wishlist. Trimmed like all input; a
 * generated secret is base64url, so no whitespace is ever part of it.
 */
export class OwnerToken {
  /**
   * Nominal-typing brand. The three bearer-secret VOs are otherwise
   * structurally identical, which would let TypeScript accept a `GuestKey`
   * or `HoldSecret` wherever an `OwnerToken` is expected — a parameter swap
   * would compile silently and surface only as a wrong-permission bug.
   * A private, literal-typed field makes the classes mutually
   * unassignable at zero runtime cost.
   */
  private readonly _brand = 'OwnerToken' as const;

  private constructor(readonly value: string) {}

  static from(raw: string): OwnerToken {
    const value = raw.trim();
    if (value.length === 0) throw new DomainValidationError('Owner token must not be empty');
    return new OwnerToken(value);
  }

  /**
   * Compares this token against a candidate using the supplied comparer.
   * The comparer is taken as a structural type rather than an imported
   * interface: domain/ may not import application/ (ADR-012).
   */
  matches(candidate: string, comparer: { compareInConstantTime(a: string, b: string): boolean }): boolean {
    return comparer.compareInConstantTime(this.value, candidate.trim());
  }
}
