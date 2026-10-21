import { describe, expect, it } from 'vitest';
import { PledgeContribution } from './PledgeContribution.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { PaymentMethods } from '../../domain/value-objects/PaymentMethods.js';
import type { AccessContext } from '../AccessContext.js';
import { ItemNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };

async function makeUseCase() {
  const persistence = inMemoryPersistence();
  const wishlist = aWishlist().withId(WISHLIST_ID).withPaymentMethods(PaymentMethods.from({ venmoHandle: 'my-venmo' })).build();
  wishlist.addItem({ type: 'group', title: 'Pram', priceMinor: 50_000 }, { generateEntityId: () => ITEM_ID });
  await persistence.wishlists.insert(wishlist);
  const useCase = new PledgeContribution(persistence.unitOfWork, new SequentialTokenGenerator(), new FixedClock(new Date('2026-01-01T00:00:00Z')));
  return { useCase, ...persistence };
}

const input = { wishlistId: WISHLIST_ID, itemId: ITEM_ID, idempotencyKey: 'idem-1', amountMinor: 2_500, name: 'Ada', message: 'Congrats' };

describe('PledgeContribution', () => {
  it('stores the contribution, the guest\'s details and a guest-actor event, both referencing the details', async () => {
    const { useCase, store, eventStore } = await makeUseCase();

    const result = await useCase.execute(input, GUEST);

    expect(result).toEqual({ contributionId: expect.any(String), itemId: ITEM_ID, amountMinor: 2_500 });
    const rows = [...store.guestPii.values()];
    expect(rows).toEqual([{ id: expect.any(String), name: 'Ada', message: 'Congrats' }]);
    expect([...store.contributions.values()].map((c) => [c.id.value, c.amount.amountMinor, c.piiRef.value])).toEqual([[result.contributionId, 2_500, rows[0]!.id]]);
    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ContributionPledged', 'guest']]);
    expect(eventStore.recorded(ITEM_ID)[0]!.event).toMatchObject({ piiRef: rows[0]!.id });
  });

  it('replays the original for the same key and session, writing nothing more', async () => {
    const { useCase, store, eventStore } = await makeUseCase();
    const first = await useCase.execute(input, GUEST);

    expect(await useCase.execute(input, GUEST)).toEqual(first);
    expect(store.contributions.size).toBe(1);
    expect(store.guestPii.size).toBe(1);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(1);
  });

  it('throws ItemNotFoundError without a guest session', async () => {
    const { useCase } = await makeUseCase();
    await expect(useCase.execute(input, { guestSession: null })).rejects.toThrow(ItemNotFoundError);
  });
});
