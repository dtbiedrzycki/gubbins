export interface TokenGenerator {
  generateId(): string;
  generateSlug(): string;
  generateOwnerToken(): string;
  generateGuestKey(): string;
  generateHoldSecret(): string;
  generateSessionId(): string;
}
