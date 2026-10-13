import { describe, expect, it } from 'vitest';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const purchaseUseCase = new MarkHoldPurchased(world.unitOfWork, world.clock);
  const purchase = (holdId: string, access: AccessContext = GUEST) => purchaseUseCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  return { ...world, purchase };
}

describe('MarkHoldPurchased', () => {
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
});
