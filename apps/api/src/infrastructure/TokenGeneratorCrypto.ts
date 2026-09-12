import { randomBytes, randomUUID } from 'node:crypto';
import type { TokenGenerator } from '../application/ports/TokenGenerator.js';

export class TokenGeneratorCrypto implements TokenGenerator {
  generateId(): string { return randomUUID(); }
  generateSlug(): string { return randomBytes(6).toString('base64url'); }
  generateOwnerToken(): string { return randomBytes(24).toString('base64url'); }
  generateGuestKey(): string { return randomBytes(24).toString('base64url'); }
  generateHoldSecret(): string { return randomBytes(24).toString('base64url'); }
  generateSessionId(): string { return randomUUID(); }
}
