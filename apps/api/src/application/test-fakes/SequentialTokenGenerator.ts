import type { TokenGenerator } from '../ports/TokenGenerator.js';

export class SequentialTokenGenerator implements TokenGenerator {
  private counter = 0;

  private next(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  /** Deterministic but UUID-v4-shaped, so it satisfies the domain's Id value objects. */
  generateId(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }

  generateSlug(): string { return this.next('slug'); }
  generateOwnerToken(): string { return this.next('owner-token'); }
  generateGuestKey(): string { return this.next('guest-key'); }
  generateHoldSecret(): string { return this.next('hold-secret'); }
  generateSessionId(): string { return this.next('session'); }
}
