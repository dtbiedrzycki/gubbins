import { createHash, timingSafeEqual } from 'node:crypto';
import type { SecretComparer } from '../application/ports/SecretComparer.js';

export class SecretComparerCrypto implements SecretComparer {
  /**
   * `timingSafeEqual` throws when its inputs differ in length, so comparing
   * the raw strings would need a length check first, and that check would
   * leak the secret's length through timing. Hashing both sides first gives
   * two 32-byte SHA-256 digests, which always have equal length, so no length
   * check is needed. Equal digests mean equal inputs; SHA-256 collisions are
   * not a practical concern. Hashing `b` takes longer for a longer `b`, but
   * `b` is the caller's own candidate, so that timing tells them nothing new.
   */
  compareInConstantTime(a: string, b: string): boolean {
    return timingSafeEqual(sha256(a), sha256(b));
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
