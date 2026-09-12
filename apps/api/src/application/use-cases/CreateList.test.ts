import { describe, expect, it } from 'vitest';
import { CreateList } from './CreateList.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import {
  InMemoryWishlistRepository, InMemoryItemRepository, InMemoryHoldRepository,
  InMemoryEventStore, InMemoryUnitOfWork,
} from '../test-fakes/InMemoryRepositories.js';

function makeUseCase() {
  const wishlists = new InMemoryWishlistRepository();
  const items = new InMemoryItemRepository();
  const holds = new InMemoryHoldRepository();
  const eventStore = new InMemoryEventStore();
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, items, holds, eventStore });
  const tokenGenerator = new SequentialTokenGenerator();
  const useCase = new CreateList(unitOfWork, tokenGenerator);
  return { useCase, wishlists, items };
}

describe('CreateList', () => {
  it('creates a wishlist and one single-type item, returning slug/ownerToken/key/itemId', async () => {
    const { useCase, wishlists, items } = makeUseCase();

    const result = await useCase.execute({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    expect(result).toEqual({
      slug: 'slug-2', ownerToken: 'owner-token-3', key: 'guest-key-4', itemId: 'id-5',
    });
    const persistedWishlist = await wishlists.findBySlug('slug-2');
    expect(persistedWishlist?.title).toBe('Baby Shower');
    const persistedItem = await items.findById('id-5');
    expect(persistedItem?.title).toBe('Stroller');
    expect(persistedItem?.wishlistId).toBe(persistedWishlist?.id);
  });
});
