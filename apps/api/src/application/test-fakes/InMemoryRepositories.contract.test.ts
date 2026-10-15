import { describeContributionRepositoryContract } from '../ports/contracts/contributionRepository.contract.js';
import { describeEventStoreContract } from '../ports/contracts/eventStore.contract.js';
import { describeGuestPiiRepositoryContract } from '../ports/contracts/guestPiiRepository.contract.js';
import { describeHoldRepositoryContract } from '../ports/contracts/holdRepository.contract.js';
import { describeWishlistRepositoryContract } from '../ports/contracts/wishlistRepository.contract.js';
import type { PersistenceFactory } from '../ports/contracts/fixture.js';
import { InMemoryContributionRepository, InMemoryGuestPiiRepository, InMemoryWishlistRepository, InMemoryStore, inMemoryPersistence } from './InMemoryRepositories.js';

const inMemory: PersistenceFactory = async () => {
  const { wishlists, holds, eventStore, guestPii } = inMemoryPersistence();
  return {
    wishlists, holds, eventStore,
    recordedEvents: async (itemId) => eventStore.recorded(itemId).map(({ event, actor }) => ({ type: event.type, actor, payload: event })),
    seedGuestPii: (id) => guestPii.insert({ id, name: 'Guest', message: null }),
    dispose: async () => {},
  };
};

describeWishlistRepositoryContract('in-memory', inMemory);
describeHoldRepositoryContract('in-memory', inMemory);
describeEventStoreContract('in-memory', inMemory);
describeGuestPiiRepositoryContract('in-memory', async () => ({ guestPii: new InMemoryGuestPiiRepository(new InMemoryStore()), dispose: async () => {} }));
describeContributionRepositoryContract('in-memory', async () => {
  const store = new InMemoryStore();
  return {
    contributions: new InMemoryContributionRepository(store), wishlists: new InMemoryWishlistRepository(store),
    seedGuestPii: async () => {}, dispose: async () => {},
  };
});
