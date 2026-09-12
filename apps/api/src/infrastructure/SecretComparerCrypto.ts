import { timingSafeEqual } from 'node:crypto';
import type { SecretComparer } from '../application/ports/SecretComparer.js';

export class SecretComparerCrypto implements SecretComparer {
  compareInConstantTime(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // node:crypto's timingSafeEqual throws on a length mismatch rather than
      // returning false, which would otherwise leak length-equality via a
      // throw-vs-not-thrown (and near-instant-return-vs-full-compare) timing
      // side channel. Performing a same-cost dummy compare of bufA against
      // itself before returning false keeps both branches paying for one
      // constant-time pass, closing that channel. ADR-035 only decided to
      // generalize constant-time comparison to all secrets, not this specific
      // mitigation; it is not the source of this technique. A residual signal
      // bounded by bufA's length remains in theory, but every secret compared
      // in this codebase (TokenGeneratorCrypto's outputs) has a fixed byte
      // length per category, so it does not manifest as an observable leak
      // in current usage.
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
