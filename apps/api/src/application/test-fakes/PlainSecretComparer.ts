import type { SecretComparer } from '../ports/SecretComparer.js';

export class PlainSecretComparer implements SecretComparer {
  compareInConstantTime(a: string, b: string): boolean {
    return a === b;
  }
}
