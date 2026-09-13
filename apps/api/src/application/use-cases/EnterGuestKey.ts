import type { WishlistRepository } from '../ports/WishlistRepository.js';
import type { SecretComparer } from '../ports/SecretComparer.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
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
  ) {}

  async execute(input: EnterGuestKeyInput): Promise<EnterGuestKeyOutput> {
    const wishlist = await this.wishlists.findBySlug(input.slug);
    if (!wishlist) throw new WishlistNotFoundError();
    if (!wishlist.key.matches(input.key, this.secretComparer)) {
      throw new InvalidGuestKeyError();
    }
    return { wishlistId: wishlist.id, keyGen: wishlist.keyGen, sessionId: this.tokenGenerator.generateSessionId() };
  }
}
