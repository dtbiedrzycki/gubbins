import type { WishlistRepository } from './WishlistRepository.js';
import type { ItemRepository } from './ItemRepository.js';
import type { HoldRepository } from './HoldRepository.js';
import type { EventStore } from './EventStore.js';

export interface TransactionContext {
  wishlists: WishlistRepository;
  items: ItemRepository;
  holds: HoldRepository;
  eventStore: EventStore;
}

export interface UnitOfWork {
  execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
