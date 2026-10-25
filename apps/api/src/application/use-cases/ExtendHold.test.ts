import { describe, expect, it } from 'vitest';
import { ExtendHold } from './ExtendHold.js';
import type { HoldPolicy } from '../HoldPolicy.js';
import type { AccessContext } from '../AccessContext.js';
import { DAY, GUEST, ITEM_ID, NO_SESSION, OTHER_GUEST, T0, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';
import { HoldAlreadyExtendedError, HoldNotFoundError } from '../../domain/errors.js';

async function setup(policy?: HoldPolicy) {
  const world = await twoListsWithOneItemEach(policy);
  const useCase = new ExtendHold(world.unitOfWork, world.clock, world.policy);
  const extend = (holdId: string, access: AccessContext = GUEST) => useCase.execute({ wishlistId: WISHLIST_ID, holdId }, access);
  return { ...world, extend };
}

const iso = (msFromT0: number) => new Date(T0.getTime() + msFromT0).toISOString();

describe('ExtendHold', () => {
  it("returns the extended hold's view, stamped at the moment of the extension", async () => {
    const { placeHold, clock, extend } = await setup();
    const { holdId } = await placeHold();
    clock.advance(DAY);

    expect(await extend(holdId)).toMatchObject({
      holdId, status: 'active', extendedAt: iso(DAY),
      actions: { extend: false, release: true, purchase: true },
    });
  });

  it('persists the extension and records HoldExtended as the guest on the item stream', async () => {
    const { placeHold, extend, eventStore, wishlists } = await setup();
    const { holdId } = await placeHold();

    await extend(holdId);

    const reloaded = await wishlists.findById(WISHLIST_ID, T0);
    expect(reloaded?.findHold(holdId)?.extendedAt).toEqual(T0);
    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor])).toEqual([['ItemHeld', 'guest'], ['HoldExtended', 'guest']]);
    expect(reloaded?.items[0]?.seq).toBe(2);
  });

  it('extends by the configured HOLD_DURATION_DAYS', async () => {
    const { placeHold, extend } = await setup({ durationDays: 1 });
    const { holdId } = await placeHold();
    expect((await extend(holdId)).expiresAt).toBe(iso(2 * DAY));
  });

  it('refuses a second extension and appends nothing', async () => {
    const { placeHold, extend, eventStore } = await setup();
    const { holdId } = await placeHold();
    await extend(holdId);

    await expect(extend(holdId)).rejects.toThrow(HoldAlreadyExtendedError);
    expect(eventStore.recorded(ITEM_ID)).toHaveLength(2);
  });

  it.each([
    ['another guest', OTHER_GUEST],
    ['a caller with no session', NO_SESSION],
  ])('treats %s as if the hold did not exist', async (_who, access) => {
    const { placeHold, extend } = await setup();
    const { holdId } = await placeHold();
    await expect(extend(holdId, access)).rejects.toThrow(HoldNotFoundError);
  });

  it('treats an unknown or malformed hold id as not found', async () => {
    const { extend } = await setup();
    await expect(extend('00000000-0000-7000-8000-999999999999')).rejects.toThrow(HoldNotFoundError);
    await expect(extend('not-a-uuid')).rejects.toThrow(HoldNotFoundError);
  });

  it('treats a hold from another list as not found (IDOR)', async () => {
    const { placeHold, extend } = await setup();
    const { holdId } = await placeHold(GUEST, true);
    await expect(extend(holdId)).rejects.toThrow(HoldNotFoundError);
  });
});
