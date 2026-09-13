import { DomainValidationError } from '../errors.js';

/**
 * The bearer secret that lets a guest release their own hold. Opaque —
 * never trimmed or normalised, since any transformation would change the
 * credential.
 */
export class HoldSecret {
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
  matches(candidate: string, comparer: { constantTimeEqual(a: string, b: string): boolean }): boolean {
    return comparer.constantTimeEqual(this.value, candidate);
  }
}
