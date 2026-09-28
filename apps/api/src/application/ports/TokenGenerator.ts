export interface TokenGenerator {
  generateEntityId(): string;
  generateSlug(): string;
  generateOwnerToken(): string;
  generateGuestKey(): string;
  generateHoldSecret(): string;
  generateSessionId(): string;
}
