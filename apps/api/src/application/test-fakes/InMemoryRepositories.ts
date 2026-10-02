import { Hold } from '../../domain/entities/Hold.js';
import { Item } from '../../domain/entities/Item.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';
import type { Actor } from '../../domain/Actor.js';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';
import { ConcurrencyError, ItemNotFoundError } from '../../domain/errors.js';
import type { EventStore } from '../ports/EventStore.js';
import type { HoldRepository } from '../ports/HoldRepository.js';
import type { TransactionContext, UnitOfWork } from '../ports/UnitOfWork.js';
import type { WishlistRepository } from '../ports/WishlistRepository.js';

/**
 * Copies through `reconstitute`, the way a real repository rebuilds rows.
 * Neither reads nor writes may share an instance with the store: the
 * domain mutates items and holds in place, so a shared instance would let
 * an unpersisted decision show up on the next read — which a SELECT never
 * could.
 */
function copyItem(item: Item): Item {
  return Item.reconstitute({
    id: item.id.value, wishlistId: item.wishlistId.value, type: item.type, title: item.title,
    quantity: item.quantity, seq: item.seq, purchasedCount: item.purchasedCount,
  });
}

function copyHold(hold: Hold): Hold {
  return Hold.reconstitute({
    id: hold.id.value, itemId: hold.itemId.value, secret: hold.secret.value, sessionHash: hold.sessionHash.value,
    idempotencyKey: hold.idempotencyKey.value, expiresAt: hold.expiresAt,
    extendedAt: hold.extendedAt, releasedAt: hold.releasedAt, purchasedAt: hold.purchasedAt,
  });
}

/**
 * The fakes' tables. One store per test, shared by every fake built on it,
 * so a hold inserted through the hold repository shows up in the wishlist
 * repository's next load — as rows in one database would.
 */
export class InMemoryStore {
  readonly wishlists = new Map<string, Wishlist>();
  readonly items = new Map<string, Item>();
  readonly holds = new Map<string, Hold>();
  readonly streams = new Map<string, { event: LedgerEvent; actor: Actor }[]>();

  holdsOnList(wishlistId: string): Hold[] {
    return [...this.holds.values()].filter((hold) => this.items.get(hold.itemId.value)?.wishlistId.value === wishlistId);
  }
}

export class InMemoryWishlistRepository implements WishlistRepository {
  constructor(private store: InMemoryStore) {}

  async insert(wishlist: Wishlist): Promise<void> {
    this.store.wishlists.set(wishlist.id.value, wishlist);
    const item = wishlist.item;
    if (item !== null) this.store.items.set(item.id.value, copyItem(item));
  }

  async findBySlug(slug: string, now: Date): Promise<Wishlist | null> {
    return this.hydrate([...this.store.wishlists.values()].find((w) => w.slug.value === slug), now);
  }

  async findById(id: string, now: Date): Promise<Wishlist | null> {
    return this.hydrate(this.store.wishlists.get(id), now);
  }

  async saveItemState(item: Item): Promise<void> {
    const stored = this.store.items.get(item.id.value);
    if (!stored || stored.wishlistId.value !== item.wishlistId.value) throw new ItemNotFoundError(item.id.value);
    this.store.items.set(item.id.value, copyItem(item));
  }

  private hydrate(wishlist: Wishlist | undefined, now: Date): Wishlist | null {
    if (wishlist === undefined) return null;
    const item = [...this.store.items.values()].find((i) => i.wishlistId.value === wishlist.id.value);
    const activeHolds = this.store.holdsOnList(wishlist.id.value).filter((h) => h.statusAt(now) === 'active').map(copyHold);
    return Wishlist.reconstitute({
      id: wishlist.id.value, slug: wishlist.slug.value, title: wishlist.title,
      ownerToken: wishlist.ownerToken.value, key: wishlist.key.value, keyGen: wishlist.keyGen,
      item: item ? copyItem(item) : undefined, activeHolds,
    });
  }
}

export class InMemoryHoldRepository implements HoldRepository {
  constructor(private store: InMemoryStore) {}

  /** Mirrors the table's primary key and UNIQUE (item_id, idempotency_key). */
  async insert(hold: Hold): Promise<void> {
    const clash = this.store.holds.has(hold.id.value) || [...this.store.holds.values()].some(
      (h) => h.itemId.value === hold.itemId.value && h.idempotencyKey.value === hold.idempotencyKey.value,
    );
    if (clash) throw new Error(`UNIQUE constraint failed: holds (${hold.id.value})`);
    this.store.holds.set(hold.id.value, copyHold(hold));
  }

  async save(hold: Hold): Promise<void> {
    if (!this.store.holds.has(hold.id.value)) throw new Error(`No hold ${hold.id.value} to save`);
    this.store.holds.set(hold.id.value, copyHold(hold));
  }

  async findById(holdId: string): Promise<Hold | null> {
    const hold = this.store.holds.get(holdId);
    return hold ? copyHold(hold) : null;
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Hold | null> {
    const hold = [...this.store.holds.values()].find((h) => h.itemId.value === itemId && h.idempotencyKey.value === idempotencyKey);
    return hold ? copyHold(hold) : null;
  }

  async findActiveForWishlist(wishlistId: string, now: Date): Promise<Hold[]> {
    return this.store.holdsOnList(wishlistId).filter((h) => h.statusAt(now) === 'active').map(copyHold);
  }

  async findForSession(wishlistId: string, sessionHash: string): Promise<Hold[]> {
    return this.store.holdsOnList(wishlistId).filter((h) => h.belongsToSession(sessionHash)).map(copyHold);
  }
}

export class InMemoryEventStore implements EventStore {
  constructor(private store: InMemoryStore) {}

  async append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void> {
    const stream = this.store.streams.get(itemId) ?? [];
    if (stream.length !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, stream.length);
    }
    this.store.streams.set(itemId, [...stream, ...events.map((event) => ({ event, actor }))]);
  }

  /** What a stream holds, envelope included — tests read it to check what a use case appended and as whom. */
  recorded(itemId: string): readonly { event: LedgerEvent; actor: Actor }[] {
    return this.store.streams.get(itemId) ?? [];
  }
}

/** No real transactionality — fine for use-case unit tests, which never assert rollback; the Kysely integration tests cover that. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private ctx: TransactionContext) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return fn(this.ctx);
  }
}

/** One store and every fake on it, wired as a use case expects. */
export function inMemoryPersistence() {
  const store = new InMemoryStore();
  const wishlists = new InMemoryWishlistRepository(store);
  const holds = new InMemoryHoldRepository(store);
  const eventStore = new InMemoryEventStore(store);
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, holds, eventStore });
  return { store, wishlists, holds, eventStore, unitOfWork };
}
