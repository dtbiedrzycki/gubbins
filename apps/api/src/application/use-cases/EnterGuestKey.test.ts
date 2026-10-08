import { describe, expect, it } from 'vitest';
import { EnterGuestKey } from './EnterGuestKey.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { PlainSecretComparer } from '../test-fakes/PlainSecretComparer.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { WishlistNotFoundError, InvalidGuestKeyError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const NOW = new Date('2026-01-01T00:00:00Z');

async function seedWishlist(wishlists: { insert(w: Wishlist): Promise<void> }) {
  const wishlist = Wishlist.create({
    id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'correct-key', asOf: NOW,
  });
  await wishlists.insert(wishlist);
  return wishlist;
}

describe('EnterGuestKey', () => {
  it('returns wishlistId/keyGen/sessionId for a correct key', async () => {
    const { wishlists } = inMemoryPersistence();
    await seedWishlist(wishlists);
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator(), new FixedClock(NOW));

    const result = await useCase.execute({ slug: 'abc123', key: 'correct-key' });

    expect(result).toEqual({ wishlistId: WISHLIST_ID, keyGen: 1, sessionId: 'session-1' });
  });

  it('throws InvalidGuestKeyError for a wrong key', async () => {
    const { wishlists } = inMemoryPersistence();
    await seedWishlist(wishlists);
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator(), new FixedClock(NOW));

    await expect(useCase.execute({ slug: 'abc123', key: 'wrong-key' })).rejects.toThrow(InvalidGuestKeyError);
  });

  it('throws WishlistNotFoundError for an unknown slug', async () => {
    const { wishlists } = inMemoryPersistence();
    const useCase = new EnterGuestKey(wishlists, new PlainSecretComparer(), new SequentialTokenGenerator(), new FixedClock(NOW));

    await expect(useCase.execute({ slug: 'no-such-slug', key: 'anything' })).rejects.toThrow(WishlistNotFoundError);
  });
});
