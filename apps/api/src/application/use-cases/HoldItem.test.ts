import { describe, expect, it } from 'vitest';
import { HoldItem } from './HoldItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { InMemoryUnitOfWork, inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../HoldPolicy.js';
import { RetryingUnitOfWork } from '../RetryingUnitOfWork.js';
import type { AccessContext } from '../AccessContext.js';
import type { EventStore } from '../ports/EventStore.js';
import { ConcurrencyError, ItemNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const NOW = new Date('2026-01-01T00:00:00Z');
const DAY = 86_400_000;
const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };
const OTHER_GUEST: AccessContext = { guestSession: { sessionHash: 'b'.repeat(64) } };

async function makeUseCase(policy: HoldPolicy = DEFAULT_HOLD_POLICY) {
  const persistence = inMemoryPersistence();
  await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
  const useCase = new HoldItem(persistence.unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new FakeHasher(), policy);
  return { useCase, ...persistence };
}

const input = (idempotencyKey = 'idem-1') => ({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, idempotencyKey });

describe('HoldItem', () => {
  it('holds an available item for the configured duration and returns its view', async () => {
    const { useCase } = await makeUseCase();

    expect(await useCase.execute(input(), GUEST)).toMatchObject({
      itemId: ITEM_ID, status: 'active', expiresAt: '2026-01-04T00:00:00.000Z', extendedAt: null,
      actions: { extend: true, release: true, purchase: true },
    });
  });

  it('stores the holder\'s details and references them from the hold and the event', async () => {
    const { useCase, store, holds, eventStore } = await makeUseCase();
    await useCase.execute({ ...input(), name: 'Ada', message: 'Congrats' }, GUEST);

    const rows = [...store.guestPii.values()];
    expect(rows).toEqual([{ id: expect.any(String), name: 'Ada', message: 'Congrats' }]);
    expect((await holds.findByIdempotencyKey(ITEM_ID, 'idem-1'))?.piiRef?.value).toBe(rows[0]!.id);
    expect(eventStore.recorded(ITEM_ID)[0]!.event).toMatchObject({ piiRef: rows[0]!.id });
  });

  it('stores no details when no name is given', async () => {
    const { useCase, store } = await makeUseCase();
    await useCase.execute(input(), GUEST);
    expect(store.guestPii.size).toBe(0);
  });

  it('inserts no second details row for a replayed key', async () => {
    const { useCase, store } = await makeUseCase();
    await useCase.execute({ ...input(), name: 'Ada' }, GUEST);
    await useCase.execute({ ...input(), name: 'Ada' }, GUEST);
    expect(store.guestPii.size).toBe(1);
  });

  it('reads HOLD_DURATION_DAYS from the policy', async () => {
    const { useCase } = await makeUseCase({ durationDays: 1 });
    expect((await useCase.execute(input(), GUEST)).expiresAt).toBe(new Date(NOW.getTime() + DAY).toISOString());
  });

  it("stores the hold under the session's hash, as presentation computed it", async () => {
    const { useCase, holds } = await makeUseCase();
    await useCase.execute(input(), GUEST);
    expect((await holds.findByIdempotencyKey(ITEM_ID, 'idem-1'))?.sessionHash.value).toBe('a'.repeat(64));
  });

  it('appends ItemHeld to the item stream as the guest (ADR-0075)', async () => {
    const { useCase, eventStore } = await makeUseCase();
    await useCase.execute(input(), GUEST);
    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest']]);
  });

  it('replays the original hold for a repeated idempotency key instead of creating a second', async () => {
    const { useCase, eventStore } = await makeUseCase();
    const first = await useCase.execute(input(), GUEST);
    expect(await useCase.execute(input(), GUEST)).toEqual(first);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(1);
  });

  it("refuses another session's idempotency key as ItemUnavailableError and writes nothing", async () => {
    const { useCase, eventStore, holds } = await makeUseCase();
    await useCase.execute(input(), GUEST);

    await expect(useCase.execute(input(), OTHER_GUEST)).rejects.toThrow(ItemUnavailableError);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(1);
    expect((await holds.findByIdempotencyKey(ITEM_ID, 'idem-1'))?.sessionHash.value).toBe('a'.repeat(64));
  });

  it('throws ItemNotFoundError without a guest session, for an unknown wishlist, or an item not on it', async () => {
    const { useCase } = await makeUseCase();
    await expect(useCase.execute(input(), { guestSession: null })).rejects.toThrow(ItemNotFoundError);
    await expect(useCase.execute({ ...input(), wishlistId: 'no-such-wishlist' }, GUEST)).rejects.toThrow(ItemNotFoundError);
    await expect(useCase.execute({ ...input(), itemId: '44444444-4444-7444-8444-444444444444' }, GUEST)).rejects.toThrow(ItemNotFoundError);
  });

  it('is re-run from the top when it loses a concurrency race, and succeeds against fresh state', async () => {
    const persistence = inMemoryPersistence();
    await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    let conflictsLeft = 2;
    const flaky: EventStore = {
      append: async (itemId, expectedSeq, events, actor) => {
        if (conflictsLeft > 0) { conflictsLeft -= 1; throw new ConcurrencyError(itemId, expectedSeq, expectedSeq + 1); }
        return persistence.eventStore.append(itemId, expectedSeq, events, actor);
      },
    };
    const unitOfWork = new RetryingUnitOfWork(
      new InMemoryUnitOfWork({ wishlists: persistence.wishlists, holds: persistence.holds, eventStore: flaky, guestPii: persistence.guestPii }),
      { logInfo: () => {}, logWarn: () => {}, logError: () => {} },
      { retries: 3, sleep: async () => {}, random: () => 0 },
    );
    const useCase = new HoldItem(unitOfWork, new SequentialTokenGenerator(), new FixedClock(NOW), new FakeHasher(), DEFAULT_HOLD_POLICY);

    await expect(useCase.execute(input(), GUEST)).resolves.toMatchObject({ status: 'active' });
    expect(persistence.eventStore.recorded(ITEM_ID)).toHaveLength(1);
  });
});
