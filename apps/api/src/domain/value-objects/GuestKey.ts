import { DomainValidationError } from '../errors.js';

/**
 * The guest bearer secret for a wishlist. Trimmed like all input; a
 * generated secret never contains whitespace.
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

  /** Keys minted before words were used are 32 base64url characters; three words are at most 29. */
  static readonly MAX_LENGTH = 32;

  private constructor(readonly value: string) {}

  static from(raw: string): GuestKey {
    const value = raw.trim();
    if (value.length === 0) throw new DomainValidationError('Guest key must not be empty');
    if (value.length > GuestKey.MAX_LENGTH) throw new DomainValidationError(`Guest key must be at most ${GuestKey.MAX_LENGTH} characters`);
    return new GuestKey(value);
  }

  /**
   * Compares this key against a candidate using the supplied comparer.
   * The comparer is taken as a structural type rather than an imported
   * interface: domain/ may not import application/ (ADR-012).
   */
  matches(candidate: string, comparer: { compareInConstantTime(a: string, b: string): boolean }): boolean {
    return comparer.compareInConstantTime(this.value, candidate.trim());
  }
}
