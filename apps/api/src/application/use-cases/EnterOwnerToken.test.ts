import { describe, expect, it } from 'vitest';
import { EnterOwnerToken } from './EnterOwnerToken.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { PlainSecretComparer } from '../test-fakes/PlainSecretComparer.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const NOW = new Date('2026-01-01T00:00:00Z');

async function useCaseWithList() {
  const { wishlists } = inMemoryPersistence();
  await wishlists.insert(Wishlist.create({
    id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'correct-key', asOf: NOW,
  }));
  return new EnterOwnerToken(wishlists, new PlainSecretComparer(), new FixedClock(NOW));
}

describe('EnterOwnerToken', () => {
  it("accepts the list's owner token", async () => {
    const useCase = await useCaseWithList();
    await expect(useCase.execute({ slug: 'abc123', ownerToken: 'owner-tok' })).resolves.toEqual({ wishlistId: WISHLIST_ID });
  });

  it.each([['wrong token', 'abc123', 'nope'], ['unknown list', 'no-such', 'owner-tok']])('fails the same way for a %s', async (_case, slug, ownerToken) => {
    const useCase = await useCaseWithList();
    await expect(useCase.execute({ slug, ownerToken })).rejects.toThrow(WishlistNotFoundError);
  });
});
