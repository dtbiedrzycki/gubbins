import type { Hasher } from '../ports/Hasher.js';

/** Deterministic, non-cryptographic — good enough for asserting "the same input hashes the same way" in use-case tests. Task 10's SecretComparerCrypto/HasherSha256 cover real hashing. */
export class FakeHasher implements Hasher {
  hash(value: string): string {
    return `hashed:${value}`;
  }
}
