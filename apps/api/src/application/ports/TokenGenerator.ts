export interface TokenGenerator {
  generateEntityId(): string;
  generateSlug(): string;
  generateOwnerToken(): string;
  generateGuestKey(): string;
  /** Whether `generateGuestKey` could have returned this exact string. Callers trim first. */
  isGuestKey(candidate: string): boolean;
  generateHoldSecret(): string;
  generateSessionId(): string;
}
