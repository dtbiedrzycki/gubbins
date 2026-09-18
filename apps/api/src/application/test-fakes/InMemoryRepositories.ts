import { Wishlist } from '../../domain/entities/Wishlist.js';
import { Item } from '../../domain/entities/Item.js';
import type { WishlistRepository } from '../ports/WishlistRepository.js';
import type { ItemRepository } from '../ports/ItemRepository.js';
import type { HoldRepository, HoldRecord } from '../ports/HoldRepository.js';
import type { EventStore, DomainEvent } from '../ports/EventStore.js';
import type { UnitOfWork, TransactionContext } from '../ports/UnitOfWork.js';
import { ConcurrencyError, ItemNotFoundError } from '../../domain/errors.js';

/**
 * Not exported: `ItemRepository` is no longer use-case-facing, so this fake
 * exists only as the collaborator `InMemoryWishlistRepository` assembles the
 * aggregate from — the same role the item/item_state tables will play for the
 * Kysely implementation.
 */
class InMemoryItemRepository implements ItemRepository {
  private byId = new Map<string, Item>();

  async insert(item: Item): Promise<void> {
    this.byId.set(item.id.value, item);
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    for (const item of this.byId.values()) {
      if (item.wishlistId.value === wishlistId) return item;
    }
    return null;
  }

  async findInWishlist(wishlistId: string, itemId: string): Promise<Item | null> {
    const item = this.byId.get(itemId);
    return item && item.wishlistId.value === wishlistId ? item : null;
  }

  /**
   * `Item` has no public setter for its concurrency fields, so marking held
   * means reconstituting a fresh instance from the stored one plus the new
   * seq — mirroring how a real UPDATE would overwrite the persisted row.
   */
  async markHeld(itemId: string, newSeq: number): Promise<void> {
    const item = this.byId.get(itemId);
    if (!item) throw new Error(`No item ${itemId}`);
    this.byId.set(itemId, Item.reconstitute({
      id: item.id.value,
      wishlistId: item.wishlistId.value,
      type: item.type,
      title: item.title,
      quantity: item.quantity,
      seq: newSeq,
      activeHolds: item.activeHolds + 1,
    }));
  }
}

/**
 * Stores whole aggregates: an inserted wishlist brings its item with it, and
 * every read hands back a `Wishlist` with that item (and its current state)
 * already attached, so callers never need a second lookup.
 */
export class InMemoryWishlistRepository implements WishlistRepository {
  private bySlug = new Map<string, Wishlist>();
  private byId = new Map<string, Wishlist>();
  private items = new InMemoryItemRepository();

  async insert(wishlist: Wishlist): Promise<void> {
    this.bySlug.set(wishlist.slug.value, wishlist);
    this.byId.set(wishlist.id.value, wishlist);
    const item = wishlist.item;
    if (item !== null) await this.items.insert(item);
  }

  async findBySlug(slug: string): Promise<Wishlist | null> {
    return this.hydrate(this.bySlug.get(slug));
  }

  async findById(id: string): Promise<Wishlist | null> {
    return this.hydrate(this.byId.get(id));
  }

  async markItemHeld(wishlistId: string, itemId: string, newSeq: number): Promise<void> {
    const item = await this.items.findInWishlist(wishlistId, itemId);
    if (item === null) throw new ItemNotFoundError(itemId);
    await this.items.markHeld(itemId, newSeq);
  }

  /**
   * Rebuilds the aggregate from the stored wishlist plus its item, which
   * already carries its own concurrency state. Every read path
   * reconstitutes — never hands back the stored instance — so the fake's
   * read identity matches the real repository's.
   */
  private async hydrate(wishlist: Wishlist | undefined): Promise<Wishlist | null> {
    if (wishlist === undefined) return null;
    const item = await this.items.findByWishlistId(wishlist.id.value);
    return Wishlist.reconstitute({
      id: wishlist.id.value,
      slug: wishlist.slug.value,
      title: wishlist.title,
      ownerToken: wishlist.ownerToken.value,
      key: wishlist.key.value,
      keyGen: wishlist.keyGen,
      item: item ?? undefined,
    });
  }
}

export class InMemoryHoldRepository implements HoldRepository {
  private holds: HoldRecord[] = [];

  async recordHold(hold: HoldRecord): Promise<void> {
    this.holds.push(hold);
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<HoldRecord | null> {
    return this.holds.find((h) => h.itemId === itemId && h.idempotencyKey === idempotencyKey) ?? null;
  }
}

export class InMemoryEventStore implements EventStore {
  private streams = new Map<string, DomainEvent[]>();

  async append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void> {
    const stream = this.streams.get(itemId) ?? [];
    if (stream.length !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, stream.length);
    }
    this.streams.set(itemId, [...stream, ...events]);
  }
}

/** No real transactionality — fine for use-case unit tests, which never assert rollback behavior; Task 9's integration tests cover that against real SQLite. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private ctx: TransactionContext) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return fn(this.ctx);
  }
}
