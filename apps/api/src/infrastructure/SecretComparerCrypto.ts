import { timingSafeEqual } from 'node:crypto';
import type { SecretComparer } from '../application/ports/SecretComparer.js';

export class SecretComparerCrypto implements SecretComparer {
  compareInConstantTime(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Compare bufA against itself so a length mismatch doesn't return
      // instantly relative to the equal-length path (ADR-035).
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
