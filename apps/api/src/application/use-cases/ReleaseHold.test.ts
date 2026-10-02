import { describe, expect, it } from 'vitest';
import { ReleaseHold } from './ReleaseHold.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, T0, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { HoldNotActiveError, HoldNotFoundError } from '../../domain/errors.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const useCase = new ReleaseHold(world.unitOfWork, world.clock);
  const release = (holdId: string, access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  return { ...world, release };
}

describe('ReleaseHold', () => {
  it('releases an active hold, closing every action on it', async () => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold();

    expect(await release(holdId)).toMatchObject({ holdId, status: 'released', actions: { extend: false, release: false, purchase: false } });
  });

  it('records HoldReleased as the guest and frees the unit for someone else', async () => {
    const { placeHold, release, eventStore, wishlists } = await setup();
    const { holdId } = await placeHold();

    await release(holdId);

    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest'], ['HoldReleased', 'guest']]);
    expect((await wishlists.findById(WISHLIST_ID, T0))?.itemStatus(ITEM_ID)).toBe('available');
    await expect(placeHold(OTHER_GUEST)).resolves.toMatchObject({ status: 'active' });
  });

  it('refuses a hold that has expired', async () => {
    const { placeHold, clock, release } = await setup();
    const { holdId } = await placeHold();
    clock.advance(3 * DAY + 1);
    await expect(release(holdId)).rejects.toThrow(HoldNotActiveError);
  });

  it('refuses a hold released already', async () => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold();
    await release(holdId);
    await expect(release(holdId)).rejects.toThrow(HoldNotActiveError);
  });

  it.each([
    ['another guest', OTHER_GUEST],
    ['a caller with no session', NO_SESSION],
  ])('treats %s as if the hold did not exist', async (_who, access) => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold();
    await expect(release(holdId, access)).rejects.toThrow(HoldNotFoundError);
  });

  it('treats a hold from another list as not found (IDOR)', async () => {
    const { placeHold, release } = await setup();
    const { holdId } = await placeHold(GUEST, true);
    await expect(release(holdId)).rejects.toThrow(HoldNotFoundError);
  });
});
