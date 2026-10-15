import { Hold } from '../../../domain/entities/Hold.js';
import { Wishlist } from '../../../domain/entities/Wishlist.js';
import type { Actor } from '../../../domain/Actor.js';
import type { LedgerEvent } from '../../../domain/events/LedgerEvent.js';
import type { EventStore } from '../EventStore.js';
import type { HoldRepository } from '../HoldRepository.js';
import type { WishlistRepository } from '../WishlistRepository.js';

/**
 * One adapter set under test, fresh per test. Every port contract suite
 * runs against both the in-memory fakes and the Kysely
 * adapters through this, so the fakes every use-case test relies on are held
 * to the same behaviour as the real thing.
 */
export interface PersistenceFixture {
  wishlists: WishlistRepository;
  holds: HoldRepository;
  eventStore: EventStore;
  /** The rows a stream holds, read behind the port: `append` returns nothing, so this is how a suite sees what it wrote. */
  recordedEvents(itemId: string): Promise<{ type: string; actor: Actor; payload: LedgerEvent }[]>;
  dispose(): Promise<void>;
}

export type PersistenceFactory = () => Promise<PersistenceFixture>;

export const LIST_A = '11111111-1111-7111-8111-111111111111';
export const LIST_B = '22222222-2222-7222-8222-222222222222';
export const ITEM_A = '33333333-3333-7333-8333-333333333333';
export const ITEM_B = '44444444-4444-7444-8444-444444444444';
export const SESSION = 'a'.repeat(64);
export const OTHER_SESSION = 'b'.repeat(64);
export const NOW = new Date('2026-03-01T12:00:00.000Z');
export const later = (ms: number) => new Date(NOW.getTime() + ms);

/** Two one-item lists, A and B, so every suite can check an adapter never answers for the wrong list. */
export async function seedTwoLists(wishlists: WishlistRepository): Promise<void> {
  const a = Wishlist.create({ id: LIST_A, slug: 'list-a', title: 'List A', ownerToken: 'owner-a', key: 'key-a', asOf: NOW });
  a.addItem({ type: 'single', title: 'Cot' }, { generateEntityId: () => ITEM_A });
  const b = Wishlist.create({ id: LIST_B, slug: 'list-b', title: 'List B', ownerToken: 'owner-b', key: 'key-b', asOf: NOW });
  b.addItem({ type: 'single', title: 'Pram' }, { generateEntityId: () => ITEM_B });
  await wishlists.insert(a);
  await wishlists.insert(b);
}

let holdCount = 0;
/**
 * A hold in persisted shape, active on item A for the session by default.
 * Built with `reconstitute`, so a fixture can sit at any point of its life,
 * already expired included.
 */
export function holdFixture(overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}): Hold {
  holdCount += 1;
  const n = String(holdCount).padStart(12, '0');
  return Hold.reconstitute({
    id: `00000000-0000-7000-8000-${n}`, itemId: ITEM_A, secret: `secret-${n}`, sessionHash: SESSION,
    idempotencyKey: `idem-${n}`, expiresAt: later(60_000), extendedAt: null, releasedAt: null, purchasedAt: null,
    ...overrides,
  });
}
