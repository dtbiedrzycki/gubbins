import { describe, expect, it } from 'vitest';
import { GetListView } from './GetListView.js';
import { PledgeContribution } from './PledgeContribution.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { ReleaseHold } from './ReleaseHold.js';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import type { HoldPolicy } from '../HoldPolicy.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, T0, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { WishlistNotFoundError } from '../../domain/errors.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';
import { PaymentMethods } from '../../domain/value-objects/PaymentMethods.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';

async function setup(policy?: HoldPolicy) {
  const world = await twoListsWithOneItemEach(policy);
  const useCase = new GetListView(world.unitOfWork, world.clock, world.policy);
  const view = (access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID }, access);
  const release = (holdId: string) => new ReleaseHold(world.unitOfWork, world.clock).execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  const purchase = (holdId: string) => new MarkHoldPurchased(world.unitOfWork, world.clock).execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  return { ...world, view, release, purchase };
}

describe('GetListView items and payment', () => {
  it("carries the list's description", async () => {
    const persistence = inMemoryPersistence();
    const wishlist = Wishlist.create({ id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key', asOf: T0, description: 'Ship to 1 Main St' });
    await persistence.wishlists.insert(wishlist);

    const shown = await new GetListView(persistence.unitOfWork, new FixedClock(T0), { durationDays: 3 })
      .execute({ wishlistId: WISHLIST_ID }, NO_SESSION);

    expect(shown.description).toBe('Ship to 1 Main St');
  });

  it('lists every item in order with its type, units left, url and price, and the payment handles', async () => {
    const persistence = inMemoryPersistence();
    const wishlist = Wishlist.create({
      id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key', asOf: T0,
      paymentMethods: PaymentMethods.from({ venmoHandle: 'sam-w' }),
    });
    const ids = ['33333333-3333-7333-8333-333333333333', '44444444-4444-7444-8444-444444444444'];
    wishlist.addItem({ type: 'single', title: 'Crib', quantity: 2, url: 'https://shop.example/crib', priceMinor: 19999 }, { generateEntityId: () => ids[0] });
    wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, { generateEntityId: () => ids[1] });
    await persistence.wishlists.insert(wishlist);

    const shown = await new GetListView(persistence.unitOfWork, new FixedClock(T0), { durationDays: 3 })
      .execute({ wishlistId: WISHLIST_ID }, NO_SESSION);

    expect(shown.items).toEqual([
      { id: ids[0], title: 'Crib', type: 'single', status: 'available', availableUnits: 2, url: 'https://shop.example/crib', priceMinor: 19999, pledgedMinor: null },
      { id: ids[1], title: 'Mixer', type: 'group', status: 'available', availableUnits: 1, url: null, priceMinor: 45000, pledgedMinor: 0 },
    ]);
    expect(shown.payment).toEqual({ venmoHandle: 'sam-w', zelleHandle: null });
  });

  it("shows a group gift's pledged total", async () => {
    const persistence = inMemoryPersistence();
    const wishlist = Wishlist.create({ id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key', asOf: T0, paymentMethods: PaymentMethods.from({ venmoHandle: 'sam-w' }) });
    const mixer = '44444444-4444-7444-8444-444444444444';
    wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, { generateEntityId: () => mixer });
    await persistence.wishlists.insert(wishlist);
    await new PledgeContribution(persistence.unitOfWork, new SequentialTokenGenerator(), new FixedClock(T0))
      .execute({ wishlistId: WISHLIST_ID, itemId: mixer, idempotencyKey: 'k1', amountMinor: 11250, name: 'Ada', message: '' }, GUEST);

    const shown = await new GetListView(persistence.unitOfWork, new FixedClock(T0), { durationDays: 3 })
      .execute({ wishlistId: WISHLIST_ID }, NO_SESSION);

    expect(shown.items.map((i) => i.pledgedMinor)).toEqual([11250]);
  });
});

describe('GetListView', () => {
  it('shows the list, its available item, no holds, and the hold duration guests will get', async () => {
    const { view } = await setup({ durationDays: 5 });

    expect(await view()).toEqual({
      title: 'Baby Shower', description: null,
      items: [{ id: ITEM_ID, title: 'Stroller', type: 'single', status: 'available', availableUnits: 1, url: null, priceMinor: null, pledgedMinor: null }],
      payment: { venmoHandle: null, zelleHandle: null },
      myHolds: [],
      capabilities: { holdDurationDays: 5 },
    });
  });

  it('shows the holder their own hold; a different guest sees the item as held but has no holds listed', async () => {
    const { placeHold, view } = await setup();
    const placed = await placeHold();

    const mine = await view(GUEST);
    const theirs = await view(OTHER_GUEST);

    expect(mine.items[0].status).toBe('held');
    expect(mine.myHolds).toEqual([placed]);
    expect(theirs.items[0].status).toBe('held');
    expect(theirs.myHolds).toEqual([]);
  });

  it('applies lazy expiry: once the hold lapses the item is available and the hold offers only purchase', async () => {
    const { placeHold, clock, view } = await setup();
    await placeHold();
    clock.advance(3 * DAY + 1);

    const shown = await view();

    expect(shown.items[0].status).toBe('available');
    expect(shown.myHolds).toMatchObject([{ status: 'expired', actions: { extend: false, release: false, purchase: true } }]);
  });

  it('lists purchased holds but not released ones', async () => {
    const { placeHold, clock, view, release, purchase } = await setup();
    const released = await placeHold();
    await release(released.holdId);
    clock.advance(DAY);
    const bought = await placeHold();
    await purchase(bought.holdId);

    const shown = await view();

    expect(shown.items[0].status).toBe('purchased');
    expect(shown.myHolds.map((h) => [h.holdId, h.status])).toEqual([[bought.holdId, 'purchased']]);
  });

  it('lists an expired hold before the newer active one', async () => {
    const { placeHold, clock, view } = await setup();
    const first = await placeHold();
    clock.advance(3 * DAY + 1);
    const second = await placeHold();

    expect((await view()).myHolds.map((h) => [h.holdId, h.status])).toEqual([[first.holdId, 'expired'], [second.holdId, 'active']]);
  });

  it('shows no holds to a caller without a session', async () => {
    const { placeHold, view } = await setup();
    await placeHold();
    expect((await view(NO_SESSION)).myHolds).toEqual([]);
  });

  it('throws WishlistNotFoundError for an unknown list', async () => {
    const world = await twoListsWithOneItemEach();
    const useCase = new GetListView(world.unitOfWork, world.clock, world.policy);
    await expect(useCase.execute({ wishlistId: '00000000-0000-7000-8000-999999999999' }, GUEST)).rejects.toThrow(WishlistNotFoundError);
  });
});
