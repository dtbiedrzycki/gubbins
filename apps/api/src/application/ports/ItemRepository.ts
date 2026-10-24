import type { Contribution } from '../../domain/entities/Contribution.js';
import type { Hold } from '../../domain/entities/Hold.js';
import type { Item } from '../../domain/entities/Item.js';

/**
 * Not a use-case-facing port: use cases reach an item only through the
 * `Wishlist` aggregate (ADR-0078). This is the collaborator a
 * `WishlistRepository` implementation assembles that aggregate from, which
 * is why it is absent from `TransactionContext`.
 */
export interface ItemRepository {
  insert(item: Item): Promise<void>;
  /** In the order they were added, each with its holds and contributions, deciding at `members.asOf`. */
  findAllByWishlistId(wishlistId: string, members: { asOf: Date; holds: readonly Hold[]; contributions: readonly Contribution[] }): Promise<Item[]>;
  /** Each item's stored `seq`, by item id: what `save` compares against. */
  seqsByWishlistId(wishlistId: string): Promise<Map<string, number>>;
  /** Writes the item's `seq`; `WishlistRepository.save` calls it for each changed item. */
  saveState(item: Item): Promise<void>;
}
