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

    // SequentialTokenGenerator's shared counter: 1=wishlist id, 2=slug,
    // 3=ownerToken, 4=key, 5=item id (see call order in CreateList.execute).
    expect(result).toEqual({
      slug: 'slug-2', ownerToken: 'owner-token-3', key: 'guest-key-4',
      itemId: '00000000-0000-4000-8000-000000000005',
    });
    const persistedWishlist = await wishlists.findBySlug('slug-2');
    expect(persistedWishlist?.title).toBe('Baby Shower');
    // The item is reachable only through the aggregate that owns it.
    const persistedItem = persistedWishlist?.item;
    expect(persistedItem?.id.value).toBe('00000000-0000-4000-8000-000000000005');
    expect(persistedItem?.title).toBe('Stroller');
    expect(persistedItem?.wishlistId.value).toBe(persistedWishlist?.id.value);
  });
});
