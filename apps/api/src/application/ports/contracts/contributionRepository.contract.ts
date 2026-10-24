import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Contribution } from '../../../domain/entities/Contribution.js';
import { Wishlist } from '../../../domain/entities/Wishlist.js';
import { PaymentMethods } from '../../../domain/value-objects/PaymentMethods.js';
import type { ContributionRepository } from '../ContributionRepository.js';
import type { WishlistRepository } from '../WishlistRepository.js';
import { later, NOW, SESSION } from './fixture.js';

export interface ContributionFixture {
  contributions: ContributionRepository;
  wishlists: WishlistRepository;
  /** Makes a guest_pii row a contribution can reference; the real table enforces the foreign key. */
  seedGuestPii(id: string): Promise<void>;
  dispose(): Promise<void>;
}
export type ContributionFactory = () => Promise<ContributionFixture>;

const LIST_X = '66666666-6666-7666-8666-666666666600';
const LIST_Y = '66666666-6666-7666-8666-666666666700';
const MIXER = '66666666-6666-7666-8666-666666666601';
const STROLLER = '66666666-6666-7666-8666-666666666602';
const OTHER_LIST_ITEM = '66666666-6666-7666-8666-666666666701';
const PII = '77777777-7777-7777-8777-777777777700';

let ids = 0;
let keys = 0;
function pledge(itemId: string, amountMinor: number, idempotencyKey = `idem-${++keys}`, pledgedAt = NOW): Contribution {
  return Contribution.reconstitute({
    id: `00000000-0000-7000-8000-${String(++ids).padStart(12, '0')}`, itemId, amountMinor, sessionHash: SESSION,
    idempotencyKey, piiRef: PII, pledgedAt,
  });
}

export function describeContributionRepositoryContract(adapter: string, factory: ContributionFactory): void {
  describe(`ContributionRepository contract (${adapter})`, () => {
    let fx: ContributionFixture;
    beforeEach(async () => {
      fx = await factory();
      const paymentMethods = PaymentMethods.from({ venmoHandle: 'my-venmo' });
      const x = Wishlist.create({ id: LIST_X, slug: 'list-x', title: 'X', ownerToken: 'o-x', key: 'k-x', asOf: NOW, paymentMethods });
      x.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, { generateEntityId: () => MIXER });
      x.addItem({ type: 'group', title: 'Stroller', priceMinor: 60000 }, { generateEntityId: () => STROLLER });
      const y = Wishlist.create({ id: LIST_Y, slug: 'list-y', title: 'Y', ownerToken: 'o-y', key: 'k-y', asOf: NOW, paymentMethods });
      y.addItem({ type: 'group', title: 'Crib', priceMinor: 30000 }, { generateEntityId: () => OTHER_LIST_ITEM });
      await fx.wishlists.insert(x);
      await fx.wishlists.insert(y);
      await fx.seedGuestPii(PII);
    });
    afterEach(async () => { await fx.dispose(); });

    it('round-trips a contribution by item and idempotency key', async () => {
      const inserted = pledge(MIXER, 2500, 'key-1');
      await fx.contributions.insert(inserted);

      const found = await fx.contributions.findByIdempotencyKey(MIXER, 'key-1');

      expect(found).toMatchObject({
        id: inserted.id, itemId: inserted.itemId, amount: inserted.amount, sessionHash: inserted.sessionHash,
        idempotencyKey: inserted.idempotencyKey, piiRef: inserted.piiRef,
      });
      expect(found?.pledgedAt).toEqual(NOW);
    });

    it('finds nothing for an unknown key or another item', async () => {
      await fx.contributions.insert(pledge(MIXER, 2500, 'key-1'));
      expect(await fx.contributions.findByIdempotencyKey(MIXER, 'nope')).toBeNull();
      expect(await fx.contributions.findByIdempotencyKey(STROLLER, 'key-1')).toBeNull();
    });

    it('refuses a second contribution with the same item and key', async () => {
      await fx.contributions.insert(pledge(MIXER, 2500, 'key-1'));
      await expect(fx.contributions.insert(pledge(MIXER, 1000, 'key-1'))).rejects.toThrow();
    });

    it('allows the same key on a different item', async () => {
      await fx.contributions.insert(pledge(MIXER, 2500, 'key-1'));
      await expect(fx.contributions.insert(pledge(STROLLER, 1000, 'key-1'))).resolves.toBeUndefined();
    });

    it('sums pledges per item on the list and leaves out other lists', async () => {
      await fx.contributions.insert(pledge(MIXER, 2500));
      await fx.contributions.insert(pledge(MIXER, 1500));
      await fx.contributions.insert(pledge(STROLLER, 7000));
      await fx.contributions.insert(pledge(OTHER_LIST_ITEM, 9999));

      expect(await fx.contributions.pledgedTotals(LIST_X)).toEqual(new Map([[MIXER, 4000], [STROLLER, 7000]]));
    });

    it("findForWishlist returns every contribution on the list's items, oldest pledge first, and none from another list", async () => {
      // Ids rise in creation order. The pledge order matches neither the id order, the insertion order nor
      // either reversed, and the two pledges made together go in larger id first, so only pledgedAt then id passes.
      const atMinute = pledge(MIXER, 2500, undefined, later(60_000));
      const atStart = pledge(STROLLER, 1500);
      const atTwoMinutes = pledge(MIXER, 500, undefined, later(120_000));
      const tiedFirst = pledge(STROLLER, 700, undefined, later(30_000));
      const tiedSecond = pledge(MIXER, 900, undefined, later(30_000));
      for (const c of [atMinute, atStart, atTwoMinutes, tiedSecond, tiedFirst, pledge(OTHER_LIST_ITEM, 1000)]) await fx.contributions.insert(c);

      const found = await fx.contributions.findForWishlist(LIST_X);

      expect(found.map((c) => c.id.value))
        .toEqual([atStart, tiedFirst, tiedSecond, atMinute, atTwoMinutes].map((c) => c.id.value));
    });

    it('leaves out items with no pledges', async () => {
      await fx.contributions.insert(pledge(MIXER, 2500));
      expect((await fx.contributions.pledgedTotals(LIST_X)).has(STROLLER)).toBe(false);
      expect((await fx.contributions.pledgedTotals(LIST_Y)).size).toBe(0);
    });
  });
}
