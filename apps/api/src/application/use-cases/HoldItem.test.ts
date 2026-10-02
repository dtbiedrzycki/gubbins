import { describe, expect, it } from 'vitest';
import { HoldItem } from './HoldItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { ItemNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00Z');

async function makeUseCase() {
  const persistence = inMemoryPersistence();
  await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
  const useCase = new HoldItem(persistence.unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new FakeHasher());
  return { useCase, ...persistence };
}

const holdInput = (sessionId = 'session-abc', idempotencyKey = 'idem-1') => ({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId, idempotencyKey });

describe('HoldItem', () => {
  it('holds an available item, which reloads as held', async () => {
    const { useCase, wishlists, holds } = await makeUseCase();

    const result = await useCase.execute(holdInput());

    expect(result.itemId).toBe(ITEM_ID);
    expect(result.expiresAt).toBe('2026-01-04T00:00:00.000Z');
    expect((await wishlists.findById(WISHLIST_ID, NOW))?.itemStatusAt(ITEM_ID, NOW)).toBe('held');
    const recorded = await holds.findByIdempotencyKey(ITEM_ID, 'idem-1');
    expect(recorded?.sessionHash.value).toBe('df98a8544084cba1bfbcf00faea193bf73d10ae13eada8c8bacf2c7f1e1d92f4');
  });

  it('appends ItemHeld to the item stream as the guest (ADR-0075)', async () => {
    const { useCase, eventStore } = await makeUseCase();

    await useCase.execute(holdInput());

    const recorded = eventStore.recorded(ITEM_ID);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].actor).toBe('guest');
    expect(recorded[0].event).toMatchObject({ type: 'ItemHeld', v: 1, itemId: ITEM_ID });
  });

  it('replays the original result for a repeated idempotency key instead of creating a second hold', async () => {
    const { useCase, eventStore } = await makeUseCase();

    const first = await useCase.execute(holdInput());
    const second = await useCase.execute(holdInput());

    expect(second).toEqual(first);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(1);
  });

  it('persists the seq the domain advanced to, so a reload appends after the hold', async () => {
    const { useCase, wishlists } = await makeUseCase();

    await useCase.execute(holdInput());

    expect((await wishlists.findById(WISHLIST_ID, NOW))?.item?.seq).toBe(1);
  });

  it('throws ItemUnavailableError for a second, different hold on a held item', async () => {
    const { useCase } = await makeUseCase();
    await useCase.execute(holdInput());

    await expect(useCase.execute(holdInput('session-xyz', 'idem-2'))).rejects.toThrow(ItemUnavailableError);
  });

  it('throws ItemNotFoundError for an unknown wishlist or item', async () => {
    const { useCase } = await makeUseCase();

    await expect(useCase.execute({ ...holdInput(), wishlistId: 'no-such-wishlist' })).rejects.toThrow(ItemNotFoundError);
    await expect(useCase.execute({ ...holdInput(), itemId: '44444444-4444-7444-8444-444444444444' })).rejects.toThrow(ItemNotFoundError);
  });
});
