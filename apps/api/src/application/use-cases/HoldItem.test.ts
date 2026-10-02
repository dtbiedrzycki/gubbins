import { describe, expect, it } from 'vitest';
import { HoldItem } from './HoldItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import {
  InMemoryWishlistRepository, InMemoryHoldRepository,
  InMemoryEventStore, InMemoryUnitOfWork,
} from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { ItemNotFoundError, ItemAlreadyHeldError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';

function makeUseCase() {
  const wishlists = new InMemoryWishlistRepository();
  const holds = new InMemoryHoldRepository();
  const eventStore = new InMemoryEventStore();
  const unitOfWork = new InMemoryUnitOfWork({ wishlists, holds, eventStore });
  const tokenGenerator = new SequentialTokenGenerator();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  const hasher = new FakeHasher();
  const useCase = new HoldItem(unitOfWork, tokenGenerator, clock, hasher);
  return { useCase, wishlists, holds, eventStore };
}

/** Seeds the whole aggregate: the item is only reachable through its wishlist. */
async function seedWishlistWithItem(wishlists: InMemoryWishlistRepository) {
  const wishlist = aWishlist()
    .withId(WISHLIST_ID)
    .withItem({ id: ITEM_ID, title: 'Stroller' })
    .build();
  await wishlists.insert(wishlist);
  return wishlist;
}

describe('HoldItem', () => {
  it('appends ItemHeld to the item stream as the guest (ADR-0075)', async () => {
    const { useCase, wishlists, eventStore } = makeUseCase();
    await seedWishlistWithItem(wishlists);

    await useCase.execute({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-abc', idempotencyKey: 'idem-1' });

    const recorded = eventStore.recorded(ITEM_ID);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].actor).toBe('guest');
    expect(recorded[0].event).toMatchObject({ type: 'ItemHeld', v: 1, itemId: ITEM_ID });
  });

  it('holds an available item, appends ItemHeld, and marks it held', async () => {
    const { useCase, wishlists, holds } = makeUseCase();
    await seedWishlistWithItem(wishlists);
    const result = await useCase.execute({
      wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-abc', idempotencyKey: 'idem-1',
    });
    expect(result.itemId).toBe(ITEM_ID);
    expect(result.expiresAt).toBe('2026-01-04T00:00:00.000Z');
    const reloaded = await wishlists.findById(WISHLIST_ID);
    expect(reloaded?.item?.status).toBe('held');
    const recorded = await holds.findByIdempotencyKey(ITEM_ID, 'idem-1');
    expect(recorded?.sessionHash).toBe('df98a8544084cba1bfbcf00faea193bf73d10ae13eada8c8bacf2c7f1e1d92f4');
  });

  it('replays the original result for a repeated idempotency key instead of creating a second hold', async () => {
    const { useCase, wishlists } = makeUseCase();
    await seedWishlistWithItem(wishlists);
    const first = await useCase.execute({
      wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-abc', idempotencyKey: 'idem-1',
    });
    const second = await useCase.execute({
      wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-abc', idempotencyKey: 'idem-1',
    });
    // The aggregate hides its hold counter, so "not a second hold" is asserted
    // behaviourally: SequentialTokenGenerator hands out a fresh id per call, so
    // an identical holdId proves the replay path ran rather than a new hold
    // being created.
    expect(second).toEqual(first);
    expect(second.holdId).toBe(first.holdId);
    const reloaded = await wishlists.findById(WISHLIST_ID);
    expect(reloaded?.item?.status).toBe('held');
  });

  it('persists the post-hold seq, not the pre-hold one, so a reload sees the version placeHold advanced to', async () => {
    const { useCase, wishlists } = makeUseCase();
    await seedWishlistWithItem(wishlists);
    // The seeded item starts at seq 0 (ItemBuilder's default); placeHold
    // appends against that and advances to 1. Asserting the reloaded value
    // is 1, not 0, is what would catch markItemHeld being called with
    // expectedSeq instead of expectedSeq + 1 — nothing else in this suite
    // reads the persisted seq back.
    await useCase.execute({
      wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-abc', idempotencyKey: 'idem-1',
    });
    const reloaded = await wishlists.findById(WISHLIST_ID);
    expect(reloaded?.item?.seq).toBe(1);
  });

  it('throws ItemAlreadyHeldError for a second, different hold attempt on a held item', async () => {
    const { useCase, wishlists } = makeUseCase();
    await seedWishlistWithItem(wishlists);
    await useCase.execute({
      wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-abc', idempotencyKey: 'idem-1',
    });
    await expect(
      useCase.execute({
        wishlistId: WISHLIST_ID, itemId: ITEM_ID, sessionId: 'session-xyz', idempotencyKey: 'idem-2',
      }),
    ).rejects.toThrow(ItemAlreadyHeldError);
  });

  it('throws ItemNotFoundError for an unknown item', async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({
        wishlistId: 'no-such-wishlist', itemId: 'no-such-item',
        sessionId: 'session-abc', idempotencyKey: 'idem-1',
      }),
    ).rejects.toThrow(ItemNotFoundError);
  });
});
