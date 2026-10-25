import type { WishlistRepository } from './WishlistRepository.js';
import type { GuestPiiRepository } from './GuestPiiRepository.js';
import type { EventStore } from './EventStore.js';

/**
 * The repositories a use case may reach for inside a transaction. There is
 * deliberately no `items` here: an `Item` is only reachable through the
 * `Wishlist` aggregate that owns it, so `ItemRepository` is an implementation
 * detail of `WishlistRepository`, not a use-case-facing port. Nor `holds` or
 * `contributions`: they are entities of the same aggregate (ADR-0078), loaded
 * and saved with it.
 */
export interface TransactionContext {
  wishlists: WishlistRepository;
  eventStore: EventStore;
  guestPii: GuestPiiRepository;
}

export interface UnitOfWork {
  execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
