import { randomBytes, randomUUID } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import type { TokenGenerator } from '../application/ports/TokenGenerator.js';

export class TokenGeneratorCrypto implements TokenGenerator {
  /**
   * UUIDv7 per ADR-0076, from the `uuid` package rather than `node:crypto`.
   * Node's `randomUUID()` produces only v4 and silently ignores a
   * `{ version: 7 }` option, so it cannot be used here — `UuidId` would
   * reject what it returns. `uuid`'s v7 also implements RFC 9562's
   * monotonic counter, without which ids minted in the same millisecond
   * sort in random order; `CreateList` mints two back to back.
   */
  generateEntityId(): string { return uuidv7(); }
  generateSlug(): string { return randomBytes(6).toString('base64url'); }
  /**
   * The three bearer secrets (owner token, guest key, hold secret) get 24
   * random bytes (192 bits) each, far beyond what brute-force guessing can
   * reach even online and unthrottled. 24 is also divisible by 3, so the
   * base64url encoding is exactly 32 characters with no padding.
   */
  generateOwnerToken(): string { return randomBytes(24).toString('base64url'); }
  generateGuestKey(): string { return randomBytes(24).toString('base64url'); }
  generateHoldSecret(): string { return randomBytes(24).toString('base64url'); }
  /**
   * Stays v4: a session id is a value inside a signed cookie, never a
   * database key — never indexed, sorted or joined on — so it gains nothing
   * from v7's ordering and is better left at v4's full 122 bits of entropy.
   */
  generateSessionId(): string { return randomUUID(); }
}
