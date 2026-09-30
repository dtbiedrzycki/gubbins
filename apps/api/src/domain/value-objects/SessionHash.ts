import { DomainValidationError } from '../errors.js';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * A hashed guest-session identifier — always a SHA-256 hex digest
 * (HasherSha256's output), never the raw session id itself.
 */
export class SessionHash {
  private readonly _brand = 'SessionHash' as const;

  private constructor(readonly value: string) {}

  static from(value: string): SessionHash {
    if (!SHA256_HEX_PATTERN.test(value)) {
      throw new DomainValidationError('Session hash must be a 64-character hex string');
    }
    return new SessionHash(value);
  }
}
