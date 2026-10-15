import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Wishlist } from '../../../domain/entities/Wishlist.js';
import { Item } from '../../../domain/entities/Item.js';
import { PaymentMethods } from '../../../domain/value-objects/PaymentMethods.js';
import { ItemNotFoundError, WishlistNotFoundError } from '../../../domain/errors.js';
import {
  ITEM_A, ITEM_B, LIST_A, LIST_B, NOW,
  holdFixture, later, seedTwoLists, type PersistenceFactory, type PersistenceFixture,
} from './fixture.js';

const LIST_C = '55555555-5555-7555-8555-555555555500';
const ITEM_C1 = '55555555-5555-7555-8555-555555555501';
const ITEM_C2 = '55555555-5555-7555-8555-555555555502';
const ITEM_A2 = '33333333-3333-7333-8333-333333333334';

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

    it('loads every item of the list, in the order they were added', async () => {
      const ids = ['55555555-5555-7555-8555-555555555551', '55555555-5555-7555-8555-555555555552'];
      const list = Wishlist.create({ id: '66666666-6666-7666-8666-666666666666', slug: 'list-c', title: 'List C', ownerToken: 'owner-c', key: 'key-c', asOf: NOW });
      let next = 0;
      for (const title of ['Stroller', 'Crib']) list.addItem({ type: 'single', title }, { generateEntityId: () => ids[next++] });
      await fx.wishlists.insert(list);

      const loaded = await fx.wishlists.findById(list.id.value, NOW);

      expect(loaded?.items.map((i) => i.id.value)).toEqual(ids);
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

    it('round-trips payment methods and item fields', async () => {
      const wishlist = Wishlist.create({ id: LIST_C, slug: 'list-c', title: 'C', ownerToken: 'o', key: 'k', asOf: NOW,
        paymentMethods: PaymentMethods.from({ venmoHandle: 'my-venmo', zelleHandle: 'me@example.com' }) });
      wishlist.addItem({ type: 'single', title: 'Crib', quantity: 2, url: 'https://shop.example/crib', priceMinor: 19999 }, { generateEntityId: () => ITEM_C1 });
      wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, { generateEntityId: () => ITEM_C2 });
      await fx.wishlists.insert(wishlist);

      const loaded = await fx.wishlists.findById(LIST_C, NOW);

      expect(loaded?.paymentMethods.venmoHandle).toBe('my-venmo');
      expect(loaded?.paymentMethods.zelleHandle).toBe('me@example.com');
      expect(loaded?.getItem(ITEM_C1)).toMatchObject({ type: 'single', quantity: 2, url: 'https://shop.example/crib', priceMinor: 19999 });
      expect(loaded?.getItem(ITEM_C2)).toMatchObject({ type: 'group', quantity: 1, priceMinor: 45000 });
    });

    it('insertItem adds an item to an existing list, with its stream at seq 0', async () => {
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      const item = wishlist.addItem({ type: 'single', title: 'Bib' }, { generateEntityId: () => ITEM_A2 });

      await fx.wishlists.insertItem(item);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);
      expect(reloaded?.items.map((i) => i.id.value)).toEqual([ITEM_A, ITEM_A2]);
      expect(reloaded?.getItem(ITEM_A2).seq).toBe(0);
    });

    it('insertItem refuses an item whose list does not exist', async () => {
      const orphan = Item.reconstitute({ id: ITEM_A2, wishlistId: LIST_C, type: 'single', title: 'Bib', quantity: 1, seq: 0 });
      await expect(fx.wishlists.insertItem(orphan)).rejects.toThrow(WishlistNotFoundError);
    });
  });
}
