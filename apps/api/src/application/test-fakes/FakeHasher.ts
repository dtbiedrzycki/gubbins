import { createHash } from 'node:crypto';
import type { Hasher } from '../ports/Hasher.js';

/**
 * Uses real SHA-256 (via node:crypto) rather than a synthetic string so its
 * output satisfies `SessionHash`'s hex-64 format invariant (a domain-layer
 * constraint). "Non-cryptographic" was never a hard requirement for a hash
 * fake — hashing has no I/O or randomness to fake away in the first place.
 * Determinism (same input -> same output) is the only property
 * HoldItem.test.ts actually relies on, and real SHA-256 still gives you
 * that. The production hashing lives in SecretComparerCrypto and HasherSha256.
 */
export class FakeHasher implements Hasher {
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
