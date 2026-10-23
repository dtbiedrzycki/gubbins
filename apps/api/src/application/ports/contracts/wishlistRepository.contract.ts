import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Wishlist } from '../../../domain/entities/Wishlist.js';
import { PaymentMethods } from '../../../domain/value-objects/PaymentMethods.js';
import { WishlistNotFoundError } from '../../../domain/errors.js';
import {
  ITEM_A, ITEM_B, LIST_A, NOW, SESSION,
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
        expect(loaded?.items[0]?.id.value).toBe(ITEM_A);
        expect(loaded?.items[0]?.seq).toBe(0);
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

    it('save writes each item\'s seq exactly as the domain left it', async () => {
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      wishlist.getItem(ITEM_A).recordEvent();
      wishlist.getItem(ITEM_A).recordEvent();

      await fx.wishlists.save(wishlist);

      expect((await fx.wishlists.findById(LIST_A, NOW))?.items[0]?.seq).toBe(2);
    });

    it('save persists a purchase, the hold and the item\'s seq together, so it counts on the next load', async () => {
      const hold = holdFixture();
      await fx.holds.insert(hold);
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      wishlist.purchaseHold(wishlist.findHold(hold.id.value)!);

      await fx.wishlists.save(wishlist);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);
      expect(reloaded?.items[0]?.seq).toBe(1);
      expect(reloaded?.purchasedCountOf(ITEM_A)).toBe(1);
      expect(reloaded?.itemStatus(ITEM_A)).toBe('purchased');
    });

    it('save persists the purchase of an expired hold, which the load left out', async () => {
      const hold = holdFixture({ expiresAt: later(-1) });
      await fx.holds.insert(hold);
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      wishlist.purchaseHold((await fx.holds.findById(hold.id.value))!);

      await fx.wishlists.save(wishlist);

      expect((await fx.wishlists.findById(LIST_A, NOW))?.purchasedCountOf(ITEM_A)).toBe(1);
    });

    it('save inserts a hold the aggregate placed', async () => {
      const piiRef = '00000000-0000-7000-8000-888888888888';
      await fx.seedGuestPii(piiRef);
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      const { hold } = wishlist.holdItem(
        { itemId: ITEM_A, sessionHash: SESSION, idempotencyKey: 'idem-placed', durationMs: 60_000, piiRef },
        { generateEntityId: () => '00000000-0000-7000-8000-777777777777', generateHoldSecret: () => 'secret-placed' },
        { hash: (value) => `hashed-${value}` },
      );

      await fx.wishlists.save(wishlist);

      expect((await fx.holds.findById(hold.id.value))?.expiresAt).toEqual(later(60_000));
      expect((await fx.wishlists.findById(LIST_A, NOW))?.itemStatus(ITEM_A)).toBe('held');
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

    it('save adds a new item to the list, with its stream at seq 0', async () => {
      const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
      wishlist.addItem({ type: 'single', title: 'Bib' }, { generateEntityId: () => ITEM_A2 });

      await fx.wishlists.save(wishlist);

      const reloaded = await fx.wishlists.findById(LIST_A, NOW);
      expect(reloaded?.items.map((i) => i.id.value)).toEqual([ITEM_A, ITEM_A2]);
      expect(reloaded?.getItem(ITEM_A2).seq).toBe(0);
    });

    it('save refuses a list that was never inserted, and does not create it', async () => {
      const unsaved = Wishlist.create({ id: LIST_C, slug: 'list-c', title: 'C', ownerToken: 'o', key: 'k', asOf: NOW });
      unsaved.addItem({ type: 'single', title: 'Bib' }, { generateEntityId: () => ITEM_C1 });

      await expect(fx.wishlists.save(unsaved)).rejects.toThrow(WishlistNotFoundError);
      expect(await fx.wishlists.findById(LIST_C, NOW)).toBeNull();
    });
  });
}
