import { describe, expect, it } from 'vitest';
import { ReleaseHold } from './ReleaseHold.js';
import type { AccessContext } from '../AccessContext.js';
import { GUEST, ITEM_ID, OTHER_GUEST, T0, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const useCase = new ReleaseHold(world.unitOfWork, world.clock);
  const release = (holdId: string, access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  return { ...world, release };
}

describe('ReleaseHold', () => {
  it('records HoldReleased as the guest and frees the unit for someone else', async () => {
    const { placeHold, release, eventStore, wishlists } = await setup();
    const { holdId } = await placeHold();

    await release(holdId);

    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest'], ['HoldReleased', 'guest']]);
    expect((await wishlists.findById(WISHLIST_ID, T0))?.itemStatus(ITEM_ID)).toBe('available');
    await expect(placeHold(OTHER_GUEST)).resolves.toMatchObject({ status: 'active' });
  });
});
