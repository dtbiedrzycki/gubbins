import { describe, expect, it } from 'vitest';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import type { AccessContext } from '../AccessContext.js';
import { aWishlist } from '../test-fakes/builders.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { DEFAULT_HOLD_POLICY } from '../HoldPolicy.js';
import { HoldItem } from './HoldItem.js';
import { DAY, GUEST, ITEM_ID, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const purchaseUseCase = new MarkHoldPurchased(world.unitOfWork, world.clock);
  const purchase = (holdId: string, access: AccessContext = GUEST) => purchaseUseCase.execute({ wishlistId: WISHLIST_ID, holdId, units: 1 }, access);
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

  it('marks 1 of 2 units purchased', async () => {
    const { unitOfWork, wishlists, clock } = await twoListsWithOneItemEach();
    await wishlists.insert(aWishlist().withId('55555555-5555-7555-8555-555555555555').withSlug('ghi789').withItem({ id: '66666666-6666-7666-8666-666666666666', title: 'Pram', quantity: 3 }).build());
    const wishlistId = '55555555-5555-7555-8555-555555555555';
    const { holdId } = await new HoldItem(unitOfWork, new SequentialTokenGenerator(), clock, new FakeHasher(), DEFAULT_HOLD_POLICY)
      .execute({ wishlistId, itemId: '66666666-6666-7666-8666-666666666666', idempotencyKey: 'k', name: 'Ada', units: 2 }, GUEST);

    const view = await new MarkHoldPurchased(unitOfWork, clock).execute({ wishlistId, holdId, units: 1 }, GUEST);

    expect(view).toMatchObject({ status: 'purchased', units: 2, purchasedUnits: 1 });
  });
});
