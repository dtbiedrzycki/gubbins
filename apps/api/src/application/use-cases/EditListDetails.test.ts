import { describe, expect, it } from 'vitest';
import { EditListDetails } from './EditListDetails.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const NOW = new Date('2026-01-01T00:00:00Z');

async function makeUseCase() {
  const { wishlists, unitOfWork } = inMemoryPersistence();
  await wishlists.insert(aWishlist().withId(WISHLIST_ID).build());
  return { useCase: new EditListDetails(unitOfWork, new FixedClock(NOW)), wishlists };
}

const input = { wishlistId: WISHLIST_ID, title: 'New title', description: 'New note' };

describe('EditListDetails', () => {
  it("saves the owner's edit", async () => {
    const { useCase, wishlists } = await makeUseCase();

    await useCase.execute(input, { guestSession: null, owner: true });

    const loaded = await wishlists.findById(WISHLIST_ID, NOW);
    expect([loaded?.title, loaded?.description]).toEqual(['New title', 'New note']);
  });

  it('treats a caller who is not the owner as no list', async () => {
    const { useCase, wishlists } = await makeUseCase();
    const before = (await wishlists.findById(WISHLIST_ID, NOW))?.title;

    await expect(useCase.execute(input, { guestSession: { sessionHash: 'a'.repeat(64) } })).rejects.toThrow(WishlistNotFoundError);
    expect((await wishlists.findById(WISHLIST_ID, NOW))?.title).toBe(before);
  });
});
