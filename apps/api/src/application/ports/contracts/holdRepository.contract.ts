import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ITEM_A, ITEM_B, LIST_A, LIST_B, NOW, OTHER_SESSION, SESSION,
  holdFixture, later, seedTwoLists, type PersistenceFactory, type PersistenceFixture,
} from './fixture.js';

export function describeHoldRepositoryContract(adapter: string, factory: PersistenceFactory): void {
  describe(`HoldRepository contract (${adapter})`, () => {
    let fx: PersistenceFixture;
    beforeEach(async () => { fx = await factory(); await seedTwoLists(fx.wishlists); });
    afterEach(async () => { await fx.dispose(); });

    it('round-trips a hold through insert and findById, lifecycle timestamps included', async () => {
      const hold = holdFixture({ extendedAt: later(-5_000), releasedAt: later(-1_000) });
      await fx.holds.insert(hold);
      expect(await fx.holds.findById(hold.id.value)).toEqual(hold);
    });

    it("round-trips a hold's piiRef", async () => {
      const piiRef = '00000000-0000-7000-8000-00000000aaaa';
      await fx.seedGuestPii(piiRef);
      const hold = holdFixture({ piiRef });
      await fx.holds.insert(hold);
      expect((await fx.holds.findById(hold.id.value))?.piiRef?.value).toBe(piiRef);
    });

    it('refuses a hold whose piiRef has no guest_pii row', async () => {
      await expect(fx.holds.insert(holdFixture({ piiRef: '00000000-0000-7000-8000-00000000bbbb' }))).rejects.toThrow();
    });

    it('returns null for an unknown or malformed id', async () => {
      expect(await fx.holds.findById('00000000-0000-7000-8000-999999999999')).toBeNull();
      expect(await fx.holds.findById('not-a-uuid')).toBeNull();
    });

    it('finds a hold by item and idempotency key, and only on that item', async () => {
      const hold = holdFixture({ idempotencyKey: 'tap-1' });
      await fx.holds.insert(hold);
      expect(await fx.holds.findByIdempotencyKey(ITEM_A, 'tap-1')).toEqual(hold);
      expect(await fx.holds.findByIdempotencyKey(ITEM_B, 'tap-1')).toBeNull();
    });

    it('refuses a second hold with the same item and idempotency key (ADR-0048)', async () => {
      await fx.holds.insert(holdFixture({ idempotencyKey: 'same' }));
      await expect(fx.holds.insert(holdFixture({ idempotencyKey: 'same' }))).rejects.toThrow();
    });

    it('save writes the lifecycle exactly as the domain left it', async () => {
      const inserted = holdFixture();
      await fx.holds.insert(inserted);
      const atNow = (await fx.wishlists.findById(LIST_A, NOW))!;
      const extended = atNow.findHold(inserted.id.value)!;
      atNow.extendHold(extended, 3_600_000);
      await fx.holds.save(extended);

      const aMomentLater = (await fx.wishlists.findById(LIST_A, later(1)))!;
      const hold = aMomentLater.findHold(inserted.id.value)!;
      aMomentLater.purchaseHold(hold);
      await fx.holds.save(hold);

      const reloaded = await fx.holds.findById(hold.id.value);
      expect(reloaded?.extendedAt).toEqual(NOW);
      expect(reloaded?.purchasedAt).toEqual(later(1));
      expect(reloaded).toEqual(hold);
    });

    it("findForWishlist returns every hold on the list's items, whatever its state, and none from another list", async () => {
      const mine = [holdFixture(), holdFixture({ expiresAt: later(-1) }), holdFixture({ releasedAt: later(-5) }), holdFixture({ purchasedAt: later(-5) })];
      for (const hold of mine) await fx.holds.insert(hold);
      await fx.holds.insert(holdFixture({ itemId: ITEM_B }));

      const found = await fx.holds.findForWishlist(LIST_A);

      expect(found.map((h) => h.id.value).sort()).toEqual(mine.map((h) => h.id.value).sort());
    });

    describe('findActiveOrPurchasedForWishlist', () => {
      it.each([
        ['expired 1 ms ago', { expiresAt: later(-1) }, false],
        ['expiring at this very instant', { expiresAt: NOW }, true],
        ['expiring 1 ms from now', { expiresAt: later(1) }, true],
        ['released', { releasedAt: later(-10) }, false],
        ['purchased', { purchasedAt: later(-10) }, true],
        ['purchased and since expired', { purchasedAt: later(-10), expiresAt: later(-5) }, true],
        ['released and since expired', { releasedAt: later(-10), expiresAt: later(-5) }, false],
      ] as const)('a hold %s is returned: %s', async (_name, overrides, returned) => {
        const hold = holdFixture(overrides);
        await fx.holds.insert(hold);

        const found = await fx.holds.findActiveOrPurchasedForWishlist(LIST_A, NOW);

        expect(found.map((h) => h.id.value)).toEqual(returned ? [hold.id.value] : []);
      });

      it("never returns another list's holds", async () => {
        await fx.holds.insert(holdFixture({ itemId: ITEM_B }));
        expect(await fx.holds.findActiveOrPurchasedForWishlist(LIST_A, NOW)).toEqual([]);
      });

      it('agrees with the aggregate loaded at the same instant on every hold it returns', async () => {
        for (const overrides of [{}, { expiresAt: later(-1) }, { releasedAt: later(-1) }, { expiresAt: NOW }, { purchasedAt: later(-1), expiresAt: later(-1) }]) {
          await fx.holds.insert(holdFixture(overrides));
        }
        const found = await fx.holds.findActiveOrPurchasedForWishlist(LIST_A, NOW);
        expect(found).toHaveLength(3);
        const wishlist = (await fx.wishlists.findById(LIST_A, NOW))!;
        expect(found.map((h) => wishlist.holdStatus(h)).sort()).toEqual(['active', 'active', 'purchased']);
      });
    });

    describe('findForSession', () => {
      it('returns every hold the session placed on the list, whatever its state', async () => {
        const holds = [holdFixture(), holdFixture({ expiresAt: later(-1) }), holdFixture({ releasedAt: later(-1) }), holdFixture({ purchasedAt: later(-1) })];
        for (const hold of holds) await fx.holds.insert(hold);

        const found = await fx.holds.findForSession(LIST_A, SESSION);

        expect(found.map((h) => h.id.value).sort()).toEqual(holds.map((h) => h.id.value).sort());
      });

      it("leaves out other sessions' holds and other lists' holds", async () => {
        await fx.holds.insert(holdFixture({ sessionHash: OTHER_SESSION }));
        await fx.holds.insert(holdFixture({ itemId: ITEM_B }));
        expect(await fx.holds.findForSession(LIST_A, SESSION)).toEqual([]);
        expect(await fx.holds.findForSession(LIST_B, OTHER_SESSION)).toEqual([]);
      });
    });
  });
}
