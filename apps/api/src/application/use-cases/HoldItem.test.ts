import { describe, expect, it } from 'vitest';
import { HoldItem } from './HoldItem.js';
import { anItem } from '../test-fakes/builders.js';
import {
  InMemoryWishlistRepository, InMemoryItemRepository, InMemoryHoldRepository,
  InMemoryEventStore, InMemoryUnitOfWork,
} from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { ItemNotFoundError, ItemAlreadyHeldError } from '../../domain/errors.js';

function makeUseCase() {
  const wishlists = new InMemoryWishlistRepository();
  const items = new InMemoryItemRepository();
  const holds = new InMemoryHoldRepository();
  const eventStore = new InMemoryEventStore();
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, items, holds, eventStore });
  const tokenGenerator = new SequentialTokenGenerator();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  const hasher = new FakeHasher();
  const useCase = new HoldItem(unitOfWork, tokenGenerator, clock, hasher);
  return { useCase, items, holds, eventStore };
}

async function seedItem(items: InMemoryItemRepository) {
  // Builder used here (Task 5) rather than Item.createSingle({...}) directly —
  // this file is where the pattern's value shows up first.
  const item = anItem().withId('item-1').withWishlistId('w1').withTitle('Stroller').build();
  await items.insert(item);
  return item;
}

describe('HoldItem', () => {
  it('holds an available item, appends ItemHeld, and marks it held', async () => {
    const { useCase, items, holds } = makeUseCase();
    await seedItem(items);

    const result = await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    expect(result.itemId).toBe('item-1');
    expect(result.expiresAt).toBe('2026-01-04T00:00:00.000Z');
    const state = await items.getState('item-1');
    expect(state.status).toBe('held');
    expect(state.activeHolds).toBe(1);
    const recorded = await holds.findByIdempotencyKey('item-1', 'idem-1');
    expect(recorded?.sessionHash).toBe('hashed:session-abc');
  });

  it('replays the original result for a repeated idempotency key instead of creating a second hold', async () => {
    const { useCase, items } = makeUseCase();
    await seedItem(items);

    const first = await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });
    const second = await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    expect(second).toEqual(first);
    const state = await items.getState('item-1');
    expect(state.activeHolds).toBe(1); // not 2
  });

  it('throws ItemAlreadyHeldError for a second, different hold attempt on a held item', async () => {
    const { useCase, items } = makeUseCase();
    await seedItem(items);
    await useCase.execute({ itemId: 'item-1', sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    await expect(
      useCase.execute({ itemId: 'item-1', sessionId: 'session-xyz', idempotencyKey: 'idem-2' }),
    ).rejects.toThrow(ItemAlreadyHeldError);
  });

  it('throws ItemNotFoundError for an unknown item', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({ itemId: 'no-such-item', sessionId: 'session-abc', idempotencyKey: 'idem-1' }),
    ).rejects.toThrow(ItemNotFoundError);
  });
});
