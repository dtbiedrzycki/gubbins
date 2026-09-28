import type { TokenGenerator } from '../ports/TokenGenerator.js';

/**
 * Deterministic tokens for use-case tests: each kind counts from 1 on its
 * own, so `generateId()`'s first call is always `…001` no matter how many
 * slugs or secrets were minted first.
 *
 * That independence is the point. A single shared counter made every value
 * depend on the call order of unrelated generators, so a test asserting an
 * id had to encode how many *other* tokens the use case happened to mint
 * before it — and adding one `generateSlug()` call anywhere silently
 * renumbered assertions elsewhere.
 *
 * The values stay plainly readable on purpose: a test that fails on
 * `…000005` says which call produced it, which is the whole reason to fake
 * this port rather than use the real generator. Unpredictability is
 * `TokenGeneratorCrypto`'s job, and is the opposite of what is wanted here.
 */
export class SequentialTokenGenerator implements TokenGenerator {
  private counters = new Map<string, number>();

  private next(kind: string): number {
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    return n;
  }

  private label(kind: string): string {
    return `${kind}-${this.next(kind)}`;
  }

  /**
   * A counter in a UUID-v4 envelope, not a UUID: `UuidId.from` requires the
   * v4 version and variant nibbles, so a bare integer — or a UUIDv5/v7,
   * which are the deterministic and ordered variants — is rejected outright.
   * The envelope is the minimum shape that a plain sequence can wear here.
   */
  generateId(): string {
    return `00000000-0000-4000-8000-${String(this.next('id')).padStart(12, '0')}`;
  }

  generateSlug(): string { return this.label('slug'); }
  generateOwnerToken(): string { return this.label('owner-token'); }
  generateGuestKey(): string { return this.label('guest-key'); }
  generateHoldSecret(): string { return this.label('hold-secret'); }
  generateSessionId(): string { return this.label('session'); }
}
