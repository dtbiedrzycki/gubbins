import { describeHoldRepositoryContract } from '../ports/contracts/holdRepository.contract.js';
import { describeWishlistRepositoryContract } from '../ports/contracts/wishlistRepository.contract.js';
import type { PersistenceFactory } from '../ports/contracts/fixture.js';
import { inMemoryPersistence } from './InMemoryRepositories.js';

const inMemory: PersistenceFactory = async () => {
  const { wishlists, holds, eventStore } = inMemoryPersistence();
  return {
    wishlists, holds, eventStore,
    recordedEvents: async (itemId) => eventStore.recorded(itemId).map(({ event, actor }) => ({ type: event.type, actor, payload: event })),
    dispose: async () => {},
  };
};

describeWishlistRepositoryContract('in-memory', inMemory);
describeHoldRepositoryContract('in-memory', inMemory);
