import { describe, expect, it } from 'vitest';
import { BuyItem } from './BuyItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { InMemoryUnitOfWork, inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { DEFAULT_HOLD_POLICY } from '../HoldPolicy.js';
import type { AccessContext } from '../AccessContext.js';
import type { EventStore } from '../ports/EventStore.js';
import { DomainValidationError, ItemNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00Z');
const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };

async function makeUseCase() {
  const persistence = inMemoryPersistence();
  await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller', quantity: 3 }).build());
  const calls: { itemId: string; expectedSeq: number; types: string[]; actor: string }[] = [];
  // The in-memory store flattens its stream, so only a wrapper can tell one append from two.
  const recording: EventStore = {
    append: async (itemId, expectedSeq, events, actor) => {
      calls.push({ itemId, expectedSeq, types: events.map((e) => e.type), actor });
      return persistence.eventStore.append(itemId, expectedSeq, events, actor);
    },
  };
  const unitOfWork = new InMemoryUnitOfWork({ wishlists: persistence.wishlists, eventStore: recording, guestPii: persistence.guestPii });
  const useCase = new BuyItem(unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new FakeHasher(), DEFAULT_HOLD_POLICY);
  return { useCase, calls, ...persistence };
}

const input = (overrides: { message?: string } = {}) => ({
  wishlistId: WISHLIST_ID, itemId: ITEM_ID, idempotencyKey: 'idem-1', name: 'Ada', units: 2, message: 'See you Saturday', ...overrides,
});

describe('BuyItem', () => {
  it('appends the held and purchased events in one append as the guest, and stores the name and message in one details row', async () => {
    const { useCase, calls, store, wishlists } = await makeUseCase();

    const view = await useCase.execute(input(), GUEST);

    expect(calls).toEqual([{ itemId: ITEM_ID, expectedSeq: 0, types: ['ItemHeld', 'ItemPurchased'], actor: 'guest' }]);
    const rows = [...store.guestPii.values()];
    expect(rows).toEqual([{ id: expect.any(String), name: 'Ada', message: 'See you Saturday' }]);
    expect((await wishlists.findById(WISHLIST_ID, NOW))?.findHold(view.holdId)?.piiRef?.value).toBe(rows[0]!.id);
    expect(view).toMatchObject({ status: 'purchased', purchasedUnits: 2 });
  });

  it('replays the first purchase for a repeated idempotency key, appending nothing more', async () => {
    const { useCase, calls, store } = await makeUseCase();
    const first = await useCase.execute(input(), GUEST);

    const second = await useCase.execute(input(), GUEST);

    expect(second.holdId).toBe(first.holdId);
    expect(calls).toHaveLength(1);
    expect(store.guestPii.size).toBe(1);
  });

  it('buys nothing and stores no details when the message is 1,000 characters, over the limit', async () => {
    const { useCase, eventStore, store } = await makeUseCase();

    // The in-memory unit of work doesn't roll back, so this fails if the details are built after the append.
    await expect(useCase.execute(input({ message: 'x'.repeat(1000) }), GUEST)).rejects.toThrow(DomainValidationError);

    expect(eventStore.recorded(ITEM_ID)).toEqual([]);
    expect(store.guestPii.size).toBe(0);
  });

  it('throws ItemNotFoundError without a guest session', async () => {
    const { useCase } = await makeUseCase();
    await expect(useCase.execute(input(), { guestSession: null })).rejects.toThrow(ItemNotFoundError);
  });
});
