import { DomainValidationError } from '../errors.js';

const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A wishlist's public, URL-safe identifier. Constrained to the base64url
 * alphabet TokenGeneratorCrypto.generateSlug() draws from, and bounded in
 * length to reject pathological input at the domain boundary.
 */
export class Slug {
  private readonly _brand = 'Slug' as const;

  private constructor(readonly value: string) {}

  static from(value: string): Slug {
    if (!SLUG_PATTERN.test(value)) {
      throw new DomainValidationError('Slug must be a non-empty base64url string of at most 64 characters');
    }
    return new Slug(value);
  }
}
