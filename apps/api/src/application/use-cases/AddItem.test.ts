import { describe, expect, it } from 'vitest';
import { AddItem } from './AddItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const NOW = new Date('2026-01-01T00:00:00Z');

async function makeUseCase() {
  const { wishlists, unitOfWork } = inMemoryPersistence();
  await wishlists.insert(aWishlist().withId(WISHLIST_ID).build());
  return { useCase: new AddItem(unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW)), wishlists };
}

const input = { wishlistId: WISHLIST_ID, type: 'single' as const, title: 'Stroller', quantity: 1 };

describe('AddItem', () => {
  it('lets the owner add a single, persisting it at stream seq 0', async () => {
    const { useCase, wishlists } = await makeUseCase();

    const { itemId } = await useCase.execute(input, { guestSession: null, owner: true });

    const item = (await wishlists.findById(WISHLIST_ID, NOW))?.getItem(itemId);
    expect(item).toMatchObject({ title: 'Stroller', seq: 0 });
  });

  it('refuses without owner access exactly as it refuses an unknown list, persisting nothing', async () => {
    const { useCase, wishlists } = await makeUseCase();

    await expect(useCase.execute(input, { guestSession: { sessionHash: 'a'.repeat(64) } })).rejects.toThrow(WishlistNotFoundError);
    expect((await wishlists.findById(WISHLIST_ID, NOW))?.items).toHaveLength(0);
  });
});
