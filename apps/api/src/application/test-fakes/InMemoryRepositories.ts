import { Contribution } from '../../domain/entities/Contribution.js';
import { Hold } from '../../domain/entities/Hold.js';
import { Item } from '../../domain/entities/Item.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';
import type { Actor } from '../../domain/Actor.js';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';
import { ConcurrencyError, WishlistNotFoundError } from '../../domain/errors.js';
import type { ContributionRepository } from '../ports/ContributionRepository.js';
import type { EventStore } from '../ports/EventStore.js';
import type { HoldRepository } from '../ports/HoldRepository.js';
import type { GuestPiiRepository } from '../ports/GuestPiiRepository.js';
import { GuestDetails } from '../../domain/value-objects/GuestDetails.js';
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
    quantity: item.quantity, url: item.url, priceMinor: item.priceMinor, seq: item.seq,
  });
}

function copyHold(hold: Hold): Hold {
  return Hold.reconstitute({
    id: hold.id.value, itemId: hold.itemId.value, secret: hold.secret.value, sessionHash: hold.sessionHash.value,
    idempotencyKey: hold.idempotencyKey.value, expiresAt: hold.expiresAt,
    extendedAt: hold.extendedAt, releasedAt: hold.releasedAt, purchasedAt: hold.purchasedAt,
    piiRef: hold.piiRef?.value ?? null,
  });
}

/**
 * The fakes' tables. One store per test, shared by every fake built on it,
 * so a hold inserted through the hold repository shows up in the wishlist
 * repository's next load — as rows in one database would.
 */
export class InMemoryStore {
  readonly wishlists = new Map<string, Wishlist>();
  /** Item rows. */
  readonly items = new Map<string, Item>();
  readonly holds = new Map<string, Hold>();
  readonly contributions = new Map<string, Contribution>();
  readonly guestPii = new Map<string, { id: string; name: string; message: string | null }>();
  readonly streams = new Map<string, { event: LedgerEvent; actor: Actor }[]>();

  holdsOnList(wishlistId: string): Hold[] {
    return [...this.holds.values()].filter((hold) => this.items.get(hold.itemId.value)?.wishlistId.value === wishlistId);
  }

  /**
   * The list's holds active or purchased at `now`, by the same predicate as
   * the SQL adapter's query: purchased, or not released with
   * `now <= expiresAt`. The hold repository contract checks it agrees with
   * the domain.
   */
  activeOrPurchasedHoldsOnList(wishlistId: string, now: Date): Hold[] {
    return this.holdsOnList(wishlistId).filter(
      (h) => h.purchasedAt !== null || (h.releasedAt === null && now.getTime() <= h.expiresAt.getTime()),
    );
  }
}

export class InMemoryWishlistRepository implements WishlistRepository {
  constructor(private store: InMemoryStore) {}

  async insert(wishlist: Wishlist): Promise<void> {
    this.store.wishlists.set(wishlist.id.value, wishlist);
    for (const item of wishlist.items) this.store.items.set(item.id.value, copyItem(item));
  }

  async findBySlug(slug: string, now: Date): Promise<Wishlist | null> {
    return this.hydrate([...this.store.wishlists.values()].find((w) => w.slug.value === slug), now);
  }

  async findById(id: string, now: Date): Promise<Wishlist | null> {
    return this.hydrate(this.store.wishlists.get(id), now);
  }

  async save(wishlist: Wishlist): Promise<void> {
    if (!this.store.wishlists.has(wishlist.id.value)) throw new WishlistNotFoundError(wishlist.id.value);
    // Items only: holds have their own port, and the purchased count is derived from them, never stored.
    for (const item of wishlist.items) this.store.items.set(item.id.value, copyItem(item));
  }

  private hydrate(wishlist: Wishlist | undefined, now: Date): Wishlist | null {
    if (wishlist === undefined) return null;
    const items = [...this.store.items.values()].filter((i) => i.wishlistId.value === wishlist.id.value).map(copyItem);
    const holds = this.store.activeOrPurchasedHoldsOnList(wishlist.id.value, now).map(copyHold);
    return Wishlist.reconstitute({
      id: wishlist.id.value, slug: wishlist.slug.value, title: wishlist.title,
      ownerToken: wishlist.ownerToken.value, key: wishlist.key.value, keyGen: wishlist.keyGen, asOf: now,
      paymentMethods: wishlist.paymentMethods,
      items, holds,
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

  async findActiveOrPurchasedForWishlist(wishlistId: string, now: Date): Promise<Hold[]> {
    return this.store.activeOrPurchasedHoldsOnList(wishlistId, now).map(copyHold);
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

export class InMemoryGuestPiiRepository implements GuestPiiRepository {
  constructor(private store: InMemoryStore) {}

  async insert(id: string, details: GuestDetails): Promise<void> {
    if (this.store.guestPii.has(id)) throw new Error(`UNIQUE constraint failed: guest_pii (${id})`);
    this.store.guestPii.set(id, { id, name: details.name, message: details.message });
  }

  async findById(id: string): Promise<GuestDetails | null> {
    const row = this.store.guestPii.get(id);
    return row ? GuestDetails.from(row) : null;
  }
}

export class InMemoryContributionRepository implements ContributionRepository {
  constructor(private store: InMemoryStore) {}

  /** Mirrors the table's primary key and UNIQUE (item_id, idempotency_key). */
  async insert(c: Contribution): Promise<void> {
    const clash = this.store.contributions.has(c.id.value) || [...this.store.contributions.values()].some(
      (o) => o.itemId.value === c.itemId.value && o.idempotencyKey.value === c.idempotencyKey.value,
    );
    if (clash) throw new Error(`UNIQUE constraint failed: contributions (${c.id.value})`);
    this.store.contributions.set(c.id.value, c); // immutable, so sharing the instance is safe
  }

  async findByIdempotencyKey(itemId: string, idempotencyKey: string): Promise<Contribution | null> {
    return [...this.store.contributions.values()].find((c) => c.itemId.value === itemId && c.idempotencyKey.value === idempotencyKey) ?? null;
  }

  async pledgedTotals(wishlistId: string): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    for (const c of this.store.contributions.values()) {
      if (this.store.items.get(c.itemId.value)?.wishlistId.value !== wishlistId) continue;
      totals.set(c.itemId.value, (totals.get(c.itemId.value) ?? 0) + c.amount.amountMinor);
    }
    return totals;
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
  const guestPii = new InMemoryGuestPiiRepository(store);
  const contributions = new InMemoryContributionRepository(store);
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, holds, eventStore, guestPii, contributions });
  return { store, wishlists, holds, eventStore, guestPii, contributions, unitOfWork };
}
