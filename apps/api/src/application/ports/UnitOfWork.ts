import type { WishlistRepository } from './WishlistRepository.js';
import type { HoldRepository } from './HoldRepository.js';
import type { GuestPiiRepository } from './GuestPiiRepository.js';
import type { ContributionRepository } from './ContributionRepository.js';
import type { EventStore } from './EventStore.js';

/**
 * The repositories a use case may reach for inside a transaction. There is
 * deliberately no `items` here: an `Item` is only reachable through the
 * `Wishlist` aggregate that owns it, so `ItemRepository` is an implementation
 * detail of `WishlistRepository`, not a use-case-facing port.
 */
export interface TransactionContext {
  wishlists: WishlistRepository;
  holds: HoldRepository;
  eventStore: EventStore;
  guestPii: GuestPiiRepository;
  contributions: ContributionRepository;
}

export interface UnitOfWork {
  execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
