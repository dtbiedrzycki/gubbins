import { describe, expect, it } from 'vitest';
import { GetListView } from './GetListView.js';
import { ReleaseHold } from './ReleaseHold.js';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import type { HoldPolicy } from '../HoldPolicy.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

async function setup(policy?: HoldPolicy) {
  const world = await twoListsWithOneItemEach(policy);
  const useCase = new GetListView(world.unitOfWork, world.clock, world.policy);
  const view = (access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID }, access);
  const release = (holdId: string) => new ReleaseHold(world.unitOfWork, world.clock).execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  const purchase = (holdId: string) => new MarkHoldPurchased(world.unitOfWork, world.clock).execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  return { ...world, view, release, purchase };
}

describe('GetListView', () => {
  it('shows the list, its available item, no holds, and the hold duration guests will get', async () => {
    const { view } = await setup({ durationDays: 5 });

    expect(await view()).toEqual({
      title: 'Baby Shower',
      item: { id: ITEM_ID, title: 'Stroller', status: 'available' },
      myHolds: [],
      capabilities: { holdDurationDays: 5 },
    });
  });

  it("shows the guest their own hold; another guest sees the item held but none of the guest's holds", async () => {
    const { placeHold, view } = await setup();
    const placed = await placeHold();

    const mine = await view(GUEST);
    const theirs = await view(OTHER_GUEST);

    expect(mine.item.status).toBe('held');
    expect(mine.myHolds).toEqual([placed]);
    expect(theirs.item.status).toBe('held');
    expect(theirs.myHolds).toEqual([]);
  });

  it('applies lazy expiry: once the hold lapses the item is available and the hold offers only purchase', async () => {
    const { placeHold, clock, view } = await setup();
    await placeHold();
    clock.advance(3 * DAY + 1);

    const shown = await view();

    expect(shown.item.status).toBe('available');
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

    expect(shown.item.status).toBe('purchased');
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
