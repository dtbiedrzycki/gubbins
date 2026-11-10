import { describe, expect, it } from 'vitest';
import { MoveItem } from './MoveItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const STROLLER_ID = '33333333-3333-7333-8333-333333333333';
const COT_ID = '44444444-4444-7444-8444-444444444444';
const NOW = new Date('2026-01-01T00:00:00Z');
const OWNER = { guestSession: null, owner: true };

async function makeUseCase() {
  const { wishlists, unitOfWork, store } = inMemoryPersistence();
  await wishlists.insert(
    aWishlist()
      .withId(WISHLIST_ID)
      .withItem({ id: STROLLER_ID, title: 'Stroller' })
      .withItem({ id: COT_ID, title: 'Cot' })
      .build(),
  );
  return { useCase: new MoveItem(unitOfWork, new FixedClock(NOW)), wishlists, store };
}

const input = { wishlistId: WISHLIST_ID, itemId: COT_ID, to: 'top' } as const;

describe('MoveItem', () => {
  it('saves the new order, appending no event', async () => {
    const { useCase, wishlists, store } = await makeUseCase();

    await useCase.execute(input, OWNER);

    expect((await wishlists.findById(WISHLIST_ID, NOW))?.items.map((i) => i.title)).toEqual(['Cot', 'Stroller']);
    expect(store.streams.size).toBe(0);
  });

  it('treats a caller who is not the owner as no list', async () => {
    const { useCase, wishlists } = await makeUseCase();

    await expect(useCase.execute(input, { guestSession: { sessionHash: 'a'.repeat(64) } })).rejects.toThrow(WishlistNotFoundError);
    expect((await wishlists.findById(WISHLIST_ID, NOW))?.items.map((i) => i.title)).toEqual(['Stroller', 'Cot']);
  });
});
