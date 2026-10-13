import type { WishlistRepository } from '../ports/WishlistRepository.js';
import type { SecretComparer } from '../ports/SecretComparer.js';
import type { Clock } from '../ports/Clock.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

export interface EnterOwnerTokenInput {
  slug: string;
  ownerToken: string;
}

export class EnterOwnerToken {
  constructor(
    private wishlists: WishlistRepository,
    private secretComparer: SecretComparer,
    private clock: Clock,
  ) {}

  async execute(input: EnterOwnerTokenInput): Promise<{ wishlistId: string }> {
    const wishlist = await this.wishlists.findBySlug(input.slug, this.clock.now());
    // A wrong token throws the same error as an unknown slug, so the two can't
    // be told apart (ADR-0016).
    if (!wishlist || !wishlist.ownerToken.matches(input.ownerToken, this.secretComparer)) {
      throw new WishlistNotFoundError(input.slug);
    }
    return { wishlistId: wishlist.id.value };
  }
}
