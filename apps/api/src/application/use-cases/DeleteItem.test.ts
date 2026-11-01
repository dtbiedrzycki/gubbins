import { describe, expect, it } from 'vitest';
import { DeleteItem } from './DeleteItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00Z');
const OWNER = { guestSession: null, owner: true };

async function makeUseCase() {
  const { wishlists, unitOfWork } = inMemoryPersistence();
  await wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
  return { useCase: new DeleteItem(unitOfWork, new FixedClock(NOW)), wishlists };
}

const input = { wishlistId: WISHLIST_ID, itemId: ITEM_ID };

describe('DeleteItem', () => {
  it('deletes the item', async () => {
    const { useCase, wishlists } = await makeUseCase();

    await useCase.execute(input, OWNER);

    expect((await wishlists.findById(WISHLIST_ID, NOW))?.items).toEqual([]);
  });

  it('treats a caller who is not the owner as no list', async () => {
    const { useCase, wishlists } = await makeUseCase();

    await expect(useCase.execute(input, { guestSession: { sessionHash: 'a'.repeat(64) } })).rejects.toThrow(WishlistNotFoundError);
    expect((await wishlists.findById(WISHLIST_ID, NOW))?.items.map((i) => i.title)).toEqual(['Stroller']);
  });
});
