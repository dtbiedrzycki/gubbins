import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Item } from '../../../domain/entities/Item.js';
import { ItemNotFoundError } from '../../../domain/errors.js';
import {
  ITEM_A, ITEM_B, LIST_A, LIST_B, NOW,
  holdFixture, later, seedTwoLists, type PersistenceFactory, type PersistenceFixture,
} from './fixture.js';

export function describeWishlistRepositoryContract(adapter: string, factory: PersistenceFactory): void {
  describe(`WishlistRepository contract (${adapter})`, () => {
    let fx: PersistenceFixture;
    beforeEach(async () => { fx = await factory(); await seedTwoLists(fx.wishlists); });
    afterEach(async () => { await fx.dispose(); });

    it('loads the whole aggregate by slug and by id, item included', async () => {
      for (const loaded of [await fx.wishlists.findBySlug('list-a', NOW), await fx.wishlists.findById(LIST_A, NOW)]) {
        expect(loaded?.id.value).toBe(LIST_A);
        expect(loaded?.title).toBe('List A');
        expect(loaded?.item?.id.value).toBe(ITEM_A);
        expect(loaded?.item?.seq).toBe(0);
        expect(loaded?.item?.purchasedCount).toBe(0);
      }
    });

    it('returns null for an unknown slug or id', async () => {
      expect(await fx.wishlists.findBySlug('no-such-list', NOW)).toBeNull();
      expect(await fx.wishlists.findById('00000000-0000-7000-8000-999999999999', NOW)).toBeNull();
    });

    it("loads the list's holds active at now, and no others (D8)", async () => {
      const active = holdFixture();
      const expired = holdFixture({ expiresAt: later(-1) });
      const released = holdFixture({ releasedAt: later(-5) });
      const elsewhere = holdFixture({ itemId: ITEM_B });
      for (const hold of [active, expired, released, elsewhere]) await fx.holds.insert(hold);

      const loaded = await fx.wishlists.findById(LIST_A, NOW);

      expect(loaded?.findHold(active.id.value)?.id.value).toBe(active.id.value);
      expect(loaded?.findHold(expired.id.value)).toBeNull();
      expect(loaded?.findHold(released.id.value)).toBeNull();
      expect(loaded?.findHold(elsewhere.id.value)).toBeNull();
    });

    it('decides availability from what it loaded: held until the hold lapses, then available', async () => {
      await fx.holds.insert(holdFixture({ expiresAt: later(60_000) }));

      const atExpiry = await fx.wishlists.findById(LIST_A, later(60_000));
      const justAfter = await fx.wishlists.findById(LIST_A, later(60_001));

      expect(atExpiry?.itemStatusAt(ITEM_A, later(60_000))).toBe('held');
      expect(justAfter?.itemStatusAt(ITEM_A, later(60_001))).toBe('available');
    });

    it('saveItemState writes seq exactly as the domain left it', async () => {
      const item = (await fx.wishlists.findById(LIST_A, NOW))!.getItem(ITEM_A);
      item.recordEvent();
      item.recordEvent();

      await fx.wishlists.saveItemState(item);

      expect((await fx.wishlists.findById(LIST_A, NOW))?.item?.seq).toBe(2);
    });

    it('computes the purchased count from purchased holds: a saved purchase counts (D21)', async () => {
      const hold = holdFixture();
      await fx.holds.insert(hold);
      hold.markPurchased(NOW);
      await fx.holds.save(hold);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);

      expect(reloaded?.item?.purchasedCount).toBe(1);
      expect(reloaded?.itemStatusAt(ITEM_A, NOW)).toBe('purchased');
    });

    it('does not take the purchased count from item state: saveItemState alone changes nothing (D21)', async () => {
      const item = (await fx.wishlists.findById(LIST_A, NOW))!.getItem(ITEM_A);
      item.recordPurchase();

      await fx.wishlists.saveItemState(item);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);
      expect(reloaded?.item?.seq).toBe(1);
      expect(reloaded?.item?.purchasedCount).toBe(0);
      expect(reloaded?.itemStatusAt(ITEM_A, NOW)).toBe('available');
    });

    it('counts neither a released nor an expired hold, nor a purchase on another list (D21)', async () => {
      for (const hold of [
        holdFixture({ releasedAt: later(-5) }),
        holdFixture({ expiresAt: later(-1) }),
        holdFixture({ itemId: ITEM_B, purchasedAt: later(-5) }),
      ]) await fx.holds.insert(hold);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);

      expect(reloaded?.item?.purchasedCount).toBe(0);
      expect(reloaded?.itemStatusAt(ITEM_A, NOW)).toBe('available');
    });

    it('saveItemState refuses an item claiming another list, and changes nothing', async () => {
      const impostor = Item.reconstitute({ id: ITEM_A, wishlistId: LIST_B, type: 'single', title: 'Cot', quantity: 1, seq: 9, purchasedCount: 1 });
      await expect(fx.wishlists.saveItemState(impostor)).rejects.toThrow(ItemNotFoundError);
      expect((await fx.wishlists.findById(LIST_A, NOW))?.item?.seq).toBe(0);
    });

    it('saveItemState refuses an item that does not exist', async () => {
      const ghost = Item.reconstitute({ id: '00000000-0000-7000-8000-999999999999', wishlistId: LIST_A, type: 'single', title: 'Ghost', quantity: 1, seq: 1, purchasedCount: 0 });
      await expect(fx.wishlists.saveItemState(ghost)).rejects.toThrow(ItemNotFoundError);
    });
  });
}
