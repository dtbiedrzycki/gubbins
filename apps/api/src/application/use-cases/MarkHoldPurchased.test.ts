import { describe, expect, it } from 'vitest';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import { ReleaseHold } from './ReleaseHold.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { HoldNotActiveError, HoldNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const purchaseUseCase = new MarkHoldPurchased(world.unitOfWork, world.clock);
  const releaseUseCase = new ReleaseHold(world.unitOfWork, world.clock);
  const purchase = (holdId: string, access: AccessContext = GUEST) => purchaseUseCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  const release = (holdId: string) => releaseUseCase.execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);
  return { ...world, purchase, release };
}

describe('MarkHoldPurchased', () => {
  it('marks an active hold purchased, closing every action on it', async () => {
    const { placeHold, purchase } = await setup();
    const { holdId } = await placeHold();

    expect(await purchase(holdId)).toMatchObject({ holdId, status: 'purchased', actions: { extend: false, release: false, purchase: false } });
  });

  it('records ItemPurchased as the guest; the item counts the unit as bought', async () => {
    const { placeHold, purchase, eventStore, wishlists, clock } = await setup();
    const { holdId } = await placeHold();

    await purchase(holdId);

    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest'], ['ItemPurchased', 'guest']]);
    const reloaded = await wishlists.findById(WISHLIST_ID, clock.now());
    expect(reloaded?.purchasedCountOf(ITEM_ID)).toBe(1);
    expect(reloaded?.itemStatus(ITEM_ID)).toBe('purchased');
  });

  it('marks an expired hold purchased while the unit is still free', async () => {
    const { placeHold, clock, purchase } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY + 1);

    await expect(purchase(holdId)).resolves.toMatchObject({ status: 'purchased' });
  });

  it('refuses an expired hold once another guest holds the unit, and appends nothing', async () => {
    const { placeHold, clock, purchase, eventStore } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY + 1);
    await placeHold(OTHER_GUEST);

    await expect(purchase(holdId)).rejects.toThrow(ItemUnavailableError);
    expect(eventStore.recorded(ITEM_ID).map(({ event }) => event.type)).toEqual(['ItemHeld', 'ItemHeld']);
  });

  it('refuses a released hold, and a second purchase — both are terminal', async () => {
    const { placeHold, purchase, release } = await setup();
    const released = await placeHold();
    await release(released.holdId);
    await expect(purchase(released.holdId)).rejects.toThrow(HoldNotActiveError);

    const bought = await placeHold();
    await purchase(bought.holdId);
    await expect(purchase(bought.holdId)).rejects.toThrow(HoldNotActiveError);
  });

  it.each([
    ['another guest', OTHER_GUEST],
    ['a caller with no session', NO_SESSION],
  ])('treats %s as if the hold did not exist', async (_who, access) => {
    const { placeHold, purchase } = await setup();
    const { holdId } = await placeHold();
    await expect(purchase(holdId, access)).rejects.toThrow(HoldNotFoundError);
  });

  it('treats a hold from another list as not found (IDOR)', async () => {
    const { placeHold, purchase } = await setup();
    const { holdId } = await placeHold(GUEST, true);
    await expect(purchase(holdId)).rejects.toThrow(HoldNotFoundError);
  });
});
