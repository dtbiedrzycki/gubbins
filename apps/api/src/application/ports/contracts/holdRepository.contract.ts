import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ITEM_B, LIST_A, NOW,
  holdFixture, later, seedTwoLists, type PersistenceFactory, type PersistenceFixture,
} from './fixture.js';

export function describeHoldRepositoryContract(adapter: string, factory: PersistenceFactory): void {
  describe(`HoldRepository contract (${adapter})`, () => {
    let fx: PersistenceFixture;
    beforeEach(async () => { fx = await factory(); await seedTwoLists(fx.wishlists); });
    afterEach(async () => { await fx.dispose(); });

    it('round-trips a hold through insert, lifecycle timestamps included', async () => {
      const hold = holdFixture({ extendedAt: later(-5_000), releasedAt: later(-1_000) });
      await fx.holds.insert(hold);
      expect(await fx.holds.findForWishlist(LIST_A)).toEqual([hold]);
    });

    it("round-trips a hold's piiRef", async () => {
      const piiRef = '00000000-0000-7000-8000-00000000aaaa';
      await fx.seedGuestPii(piiRef);
      await fx.holds.insert(holdFixture({ piiRef }));
      expect((await fx.holds.findForWishlist(LIST_A))[0]?.piiRef?.value).toBe(piiRef);
    });

    it('refuses a hold whose piiRef has no guest_pii row', async () => {
      await expect(fx.holds.insert(holdFixture({ piiRef: '00000000-0000-7000-8000-00000000bbbb' }))).rejects.toThrow();
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

      const [reloaded] = await fx.holds.findForWishlist(LIST_A);
      expect(reloaded?.extendedAt).toEqual(NOW);
      expect(reloaded?.purchasedAt).toEqual(later(1));
      expect(reloaded).toEqual(hold);
    });

    it("findForWishlist returns every hold on the list's items, whatever its state, oldest expiry first then by id, and none from another list", async () => {
      // Ids rise in creation order. The expiry order matches neither the id order, the insertion order nor
      // either reversed, and the two holds expiring together go in larger id first, so only expires_at then id passes.
      const active = holdFixture();
      const purchased = holdFixture({ expiresAt: later(-2), purchasedAt: later(-5) });
      const released = holdFixture({ expiresAt: later(120_000), releasedAt: later(-5) });
      const expired = holdFixture({ expiresAt: later(-1) });
      const tiedFirst = holdFixture({ expiresAt: later(90_000) });
      const tiedSecond = holdFixture({ expiresAt: later(90_000) });
      for (const hold of [active, purchased, released, tiedSecond, tiedFirst, expired]) await fx.holds.insert(hold);
      await fx.holds.insert(holdFixture({ itemId: ITEM_B }));

      const found = await fx.holds.findForWishlist(LIST_A);

      expect(found.map((h) => h.id.value))
        .toEqual([purchased, expired, active, tiedFirst, tiedSecond, released].map((h) => h.id.value));
    });
  });
}
