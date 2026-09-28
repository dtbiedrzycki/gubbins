import { describe, expect, it } from 'vitest';
import { EnterGuestKey } from './EnterGuestKey.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';
import { InMemoryWishlistRepository } from '../test-fakes/InMemoryRepositories.js';
import { PlainSecretComparer } from '../test-fakes/PlainSecretComparer.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';

async function seedWishlist(wishlists: InMemoryWishlistRepository) {
  const wishlist = Wishlist.create({
    id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'correct-key',
  });
  await wishlists.insert(wishlist);
  return wishlist;
}

describe('EnterGuestKey', () => {
  it('returns wishlistId/keyGen/sessionId for a correct key', async () => {
    const wishlists = new InMemoryWishlistRepository();
    await seedWishlist(wishlists);
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator());

    const result = await useCase.execute({ slug: 'abc123', key: 'correct-key' });

    expect(result).toEqual({ wishlistId: WISHLIST_ID, keyGen: 1, sessionId: 'session-1' });
  });

  it('throws InvalidGuestKeyError for a wrong key', async () => {
    const wishlists = new InMemoryWishlistRepository();
    await seedWishlist(wishlists);
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator());

    await expect(useCase.execute({ slug: 'abc123', key: 'wrong-key' })).rejects.toThrow(InvalidGuestKeyError);
  });

  it('throws WishlistNotFoundError for an unknown slug', async () => {
    const wishlists = new InMemoryWishlistRepository();
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator());

    await expect(useCase.execute({ slug: 'no-such-slug', key: 'anything' })).rejects.toThrow(WishlistNotFoundError);
  });
});
