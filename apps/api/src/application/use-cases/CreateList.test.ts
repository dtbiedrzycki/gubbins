import { describe, expect, it } from 'vitest';
import { CreateList } from './CreateList.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import {
  InMemoryWishlistRepository, InMemoryHoldRepository,
  InMemoryEventStore, InMemoryUnitOfWork,
} from '../test-fakes/InMemoryRepositories.js';

function makeUseCase() {
  const wishlists = new InMemoryWishlistRepository();
  const holds = new InMemoryHoldRepository();
  const eventStore = new InMemoryEventStore();
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, holds, eventStore });
  const tokenGenerator = new SequentialTokenGenerator();
  const useCase = new CreateList(unitOfWork, tokenGenerator);
  return { useCase, wishlists };
}

describe('CreateList', () => {
  it('creates a wishlist and one single-type item, returning slug/ownerToken/key/itemId', async () => {
    const { useCase, wishlists } = makeUseCase();

    const result = await useCase.execute({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    // Each kind counts from 1 on its own; the item id is the second id the
    // use case mints, after the wishlist's.
    expect(result).toEqual({
      slug: 'slug-1', ownerToken: 'owner-token-1', key: 'guest-key-1',
      itemId: '00000000-0000-7000-8000-000000000002',
    });
    const persistedWishlist = await wishlists.findBySlug('slug-1');
    expect(persistedWishlist?.title).toBe('Baby Shower');
    // The item is reachable only through the aggregate that owns it.
    const persistedItem = persistedWishlist?.item;
    expect(persistedItem?.id.value).toBe('00000000-0000-7000-8000-000000000002');
    expect(persistedItem?.title).toBe('Stroller');
    expect(persistedItem?.wishlistId.value).toBe(persistedWishlist?.id.value);
  });
});
