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
        expect(loaded?.purchasedCountOf(ITEM_A)).toBe(0);
      }
    });

    it('returns null for an unknown slug or id', async () => {
      expect(await fx.wishlists.findBySlug('no-such-list', NOW)).toBeNull();
      expect(await fx.wishlists.findById('00000000-0000-7000-8000-999999999999', NOW)).toBeNull();
    });

    it("loads the list's holds active or purchased at now, and no others", async () => {
      const active = holdFixture();
      const purchased = holdFixture({ purchasedAt: later(-5), expiresAt: later(-1) });
      const expired = holdFixture({ expiresAt: later(-1) });
      const released = holdFixture({ releasedAt: later(-5) });
      const elsewhere = holdFixture({ itemId: ITEM_B });
      for (const hold of [active, purchased, expired, released, elsewhere]) await fx.holds.insert(hold);

      const loaded = await fx.wishlists.findById(LIST_A, NOW);

      expect(loaded?.findHold(active.id.value)?.id.value).toBe(active.id.value);
      expect(loaded?.findHold(purchased.id.value)?.id.value).toBe(purchased.id.value);
      expect(loaded?.findHold(expired.id.value)).toBeNull();
      expect(loaded?.findHold(released.id.value)).toBeNull();
      expect(loaded?.findHold(elsewhere.id.value)).toBeNull();
    });

    it('decides availability from what it loaded: held until the hold lapses, then available', async () => {
      await fx.holds.insert(holdFixture({ expiresAt: later(60_000) }));

      const atExpiry = await fx.wishlists.findById(LIST_A, later(60_000));
      const justAfter = await fx.wishlists.findById(LIST_A, later(60_001));

      expect(atExpiry?.itemStatus(ITEM_A)).toBe('held');
      expect(justAfter?.itemStatus(ITEM_A)).toBe('available');
    });

    it('saveItemState writes seq exactly as the domain left it', async () => {
      const item = (await fx.wishlists.findById(LIST_A, NOW))!.getItem(ITEM_A);
      item.recordEvent();
      item.recordEvent();

      await fx.wishlists.saveItemState(item);

      expect((await fx.wishlists.findById(LIST_A, NOW))?.item?.seq).toBe(2);
    });

    it('counts the purchased holds it loads: a saved purchase counts', async () => {
      const hold = holdFixture();
      await fx.holds.insert(hold);
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      const loaded = wishlist.findHold(hold.id.value)!;
      wishlist.purchaseHold(loaded);
      await fx.holds.save(loaded);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);

      expect(reloaded?.purchasedCountOf(ITEM_A)).toBe(1);
      expect(reloaded?.itemStatus(ITEM_A)).toBe('purchased');
    });

    it('an unsaved purchase does not count: saveItemState alone persists only seq', async () => {
      const hold = holdFixture();
      await fx.holds.insert(hold);
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      const { item } = wishlist.purchaseHold(wishlist.findHold(hold.id.value)!);
      expect(wishlist.purchasedCountOf(ITEM_A)).toBe(1);

      await fx.wishlists.saveItemState(item);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);
      expect(reloaded?.item?.seq).toBe(1);
      expect(reloaded?.purchasedCountOf(ITEM_A)).toBe(0);
      expect(reloaded?.itemStatus(ITEM_A)).toBe('held');
    });

    it('counts neither a released nor an expired hold, nor a purchase on another list', async () => {
      for (const hold of [
        holdFixture({ releasedAt: later(-5) }),
        holdFixture({ expiresAt: later(-1) }),
        holdFixture({ itemId: ITEM_B, purchasedAt: later(-5) }),
      ]) await fx.holds.insert(hold);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);

      expect(reloaded?.purchasedCountOf(ITEM_A)).toBe(0);
      expect(reloaded?.itemStatus(ITEM_A)).toBe('available');
    });

    it('saveItemState refuses an item claiming another list, and changes nothing', async () => {
      const impostor = Item.reconstitute({ id: ITEM_A, wishlistId: LIST_B, type: 'single', title: 'Cot', quantity: 1, seq: 9 });
      await expect(fx.wishlists.saveItemState(impostor)).rejects.toThrow(ItemNotFoundError);
      expect((await fx.wishlists.findById(LIST_A, NOW))?.item?.seq).toBe(0);
    });

    it('saveItemState refuses an item that does not exist', async () => {
      const ghost = Item.reconstitute({ id: '00000000-0000-7000-8000-999999999999', wishlistId: LIST_A, type: 'single', title: 'Ghost', quantity: 1, seq: 1 });
      await expect(fx.wishlists.saveItemState(ghost)).rejects.toThrow(ItemNotFoundError);
    });
  });
}
