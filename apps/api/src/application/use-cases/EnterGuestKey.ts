import type { WishlistRepository } from '../ports/WishlistRepository.js';
import type { SecretComparer } from '../ports/SecretComparer.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../../domain/errors.js';

export interface EnterGuestKeyInput {
  slug: string;
  key: string;
}

export interface EnterGuestKeyOutput {
  wishlistId: string;
  keyGen: number;
  sessionId: string;
}

export class EnterGuestKey {
  constructor(
    private wishlists: WishlistRepository,
    private secretComparer: SecretComparer,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
  ) {}

  async execute(input: EnterGuestKeyInput): Promise<EnterGuestKeyOutput> {
    const wishlist = await this.wishlists.findBySlug(input.slug, this.clock.now());
    // Looked up by slug, so no wishlist id exists yet when this fails.
    if (!wishlist) throw new WishlistNotFoundError(input.slug);
    if (!wishlist.key.matches(input.key, this.secretComparer)) {
      throw new InvalidGuestKeyError(wishlist.id.value);
    }
    return { wishlistId: wishlist.id.value, keyGen: wishlist.keyGen, sessionId: this.tokenGenerator.generateSessionId() };
  }
}
