import type { Wishlist } from '../../domain/entities/Wishlist.js';
import type { Item } from '../../domain/entities/Item.js';
import type { WishlistRepository } from '../ports/WishlistRepository.js';
import type { ItemRepository, ItemState } from '../ports/ItemRepository.js';
import type { HoldRepository, HoldRecord } from '../ports/HoldRepository.js';
import type { EventStore, DomainEvent } from '../ports/EventStore.js';
import type { UnitOfWork, TransactionContext } from '../ports/UnitOfWork.js';
import { ConcurrencyError } from '../../domain/errors.js';

export class InMemoryWishlistRepository implements WishlistRepository {
  private bySlug = new Map<string, Wishlist>();

  async insert(wishlist: Wishlist): Promise<void> {
    this.bySlug.set(wishlist.slug, wishlist);
  }

  async findBySlug(slug: string): Promise<Wishlist | null> {
    return this.bySlug.get(slug) ?? null;
  }
}

export class InMemoryItemRepository implements ItemRepository {
  private byId = new Map<string, Item>();
  private states = new Map<string, ItemState>();

  async insert(item: Item): Promise<void> {
    this.byId.set(item.id, item);
    this.states.set(item.id, { seq: 0, activeHolds: 0, status: 'available' });
  }

  async findById(id: string): Promise<Item | null> {
    return this.byId.get(id) ?? null;
  }

  async findByWishlistId(wishlistId: string): Promise<Item | null> {
    for (const item of this.byId.values()) {
      if (item.wishlistId === wishlistId) return item;
    }
    return null;
  }

  async getState(itemId: string): Promise<ItemState> {
    const state = this.states.get(itemId);
    if (!state) throw new Error(`No state for item ${itemId}`);
    return state;
  }

  async markHeld(itemId: string, newSeq: number): Promise<void> {
    const state = this.states.get(itemId);
    if (!state) throw new Error(`No state for item ${itemId}`);
    this.states.set(itemId, { seq: newSeq, activeHolds: state.activeHolds + 1, status: 'held' });
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
