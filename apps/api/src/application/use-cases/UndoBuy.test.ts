import { describe, expect, it } from 'vitest';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import { UndoBuy } from './UndoBuy.js';
import { DAY, GUEST, ITEM_ID, T0, WISHLIST_ID, twoListsWithOneItemEach } from '../test-fakes/scenarios.js';

async function setup() {
  const world = await twoListsWithOneItemEach();
  const buy = new MarkHoldPurchased(world.unitOfWork, world.clock);
  const undo = new UndoBuy(world.unitOfWork, world.clock);
  return { ...world, buy, undo };
}

describe('UndoBuy', () => {
  it('records BuyUndone as the guest, and saves the instant the buy was undone', async () => {
    const { placeHold, buy, undo, clock, eventStore, wishlists } = await setup();
    const { holdId } = await placeHold();
    await buy.execute({ wishlistId: WISHLIST_ID, holdId, units: 1 }, GUEST);
    clock.advance(DAY);

    const view = await undo.execute({ wishlistId: WISHLIST_ID, holdId }, GUEST);

    expect(view.status).toBe('undone');
    const reloaded = await wishlists.findById(WISHLIST_ID, clock.now());
    expect(reloaded?.findHold(holdId)?.buyUndoneAt).toEqual(new Date(T0.getTime() + DAY));
    expect(eventStore.recorded(ITEM_ID).map(({ event, actor }) => [event.type, actor]).at(-1)).toEqual(['BuyUndone', 'guest']);
  });
});
