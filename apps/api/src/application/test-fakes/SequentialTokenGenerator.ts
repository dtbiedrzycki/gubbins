import type { TokenGenerator } from '../ports/TokenGenerator.js';

export class SequentialTokenGenerator implements TokenGenerator {
  private counter = 0;

  private next(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  generateId(): string { return this.next('id'); }
  generateSlug(): string { return this.next('slug'); }
  generateOwnerToken(): string { return this.next('owner-token'); }
  generateGuestKey(): string { return this.next('guest-key'); }
  generateHoldSecret(): string { return this.next('hold-secret'); }
  generateSessionId(): string { return this.next('session'); }
}
