import { DomainValidationError } from '../errors.js';

/**
 * The bearer secret that lets a guest release their own hold. Opaque —
 * never trimmed or normalised, since any transformation would change the
 * credential.
 */
export class HoldSecret {
  /**
   * Nominal-typing brand. The three bearer-secret VOs are otherwise
   * structurally identical, which would let TypeScript accept an
   * `OwnerToken` or `GuestKey` wherever a `HoldSecret` is expected — a
   * parameter swap would compile silently and surface only as a
   * wrong-permission bug. A private, literal-typed field makes the classes
   * mutually unassignable at zero runtime cost.
   */
  private readonly _brand = 'HoldSecret' as const;

  private constructor(readonly value: string) {}

  static from(value: string): HoldSecret {
    if (value.length === 0) throw new DomainValidationError('Hold secret must not be empty');
    return new HoldSecret(value);
  }

  /**
   * Compares this secret against a candidate using the supplied comparer.
   * The comparer is taken as a structural type rather than an imported
   * interface: domain/ may not import application/ (ADR-012).
   */
  matches(candidate: string, comparer: { compareInConstantTime(a: string, b: string): boolean }): boolean {
    return comparer.compareInConstantTime(this.value, candidate);
  }
}
