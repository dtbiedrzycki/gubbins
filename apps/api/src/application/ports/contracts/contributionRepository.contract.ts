import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Contribution } from '../../../domain/entities/Contribution.js';
import { Wishlist } from '../../../domain/entities/Wishlist.js';
import { PaymentMethods } from '../../../domain/value-objects/PaymentMethods.js';
import type { ContributionRepository } from '../ContributionRepository.js';
import type { WishlistRepository } from '../WishlistRepository.js';
import { NOW, SESSION } from './fixture.js';

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

let count = 0;
function pledge(itemId: string, amountMinor: number, idempotencyKey = `idem-${++count}`): Contribution {
  return Contribution.reconstitute({
    id: `00000000-0000-7000-8000-${String(++count).padStart(12, '0')}`, itemId, amountMinor, sessionHash: SESSION,
    idempotencyKey, piiRef: PII, pledgedAt: NOW,
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

    it('round-trips a contribution', async () => {
      const inserted = pledge(MIXER, 2500, 'key-1');
      await fx.contributions.insert(inserted);

      const [found] = await fx.contributions.findForWishlist(LIST_X);

      expect(found).toMatchObject({
        id: inserted.id, itemId: inserted.itemId, amount: inserted.amount, sessionHash: inserted.sessionHash,
        idempotencyKey: inserted.idempotencyKey, piiRef: inserted.piiRef,
      });
      expect(found?.pledgedAt).toEqual(NOW);
    });

    it('refuses a second contribution with the same item and key', async () => {
      await fx.contributions.insert(pledge(MIXER, 2500, 'key-1'));
      await expect(fx.contributions.insert(pledge(MIXER, 1000, 'key-1'))).rejects.toThrow();
    });

    it('allows the same key on a different item', async () => {
      await fx.contributions.insert(pledge(MIXER, 2500, 'key-1'));
      await fx.contributions.insert(pledge(STROLLER, 1000, 'key-1'));
      expect(await fx.contributions.findForWishlist(LIST_X)).toHaveLength(2);
    });

    it("findForWishlist returns every contribution on the list's items, oldest pledge first, and none from another list", async () => {
      const first = pledge(MIXER, 2500);
      const second = pledge(STROLLER, 1500);
      for (const c of [first, second, pledge(OTHER_LIST_ITEM, 1000)]) await fx.contributions.insert(c);

      const found = await fx.contributions.findForWishlist(LIST_X);

      expect(found.map((c) => c.id.value)).toEqual([first.id.value, second.id.value]);
    });
  });
}
