import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Contribution } from '../../../domain/entities/Contribution.js';
import { Wishlist } from '../../../domain/entities/Wishlist.js';
import type { ContributionRepository } from '../ContributionRepository.js';
import type { WishlistRepository } from '../WishlistRepository.js';
import { later, NOW, SESSION } from './fixture.js';

export interface ContributionFixture {
  contributions: ContributionRepository;
  wishlists: WishlistRepository;
  /** Makes a guest_pii row a contribution can reference; the real table enforces the foreign key. */
  seedGuestPii(id: string): Promise<void>;
  /** A pledge's owner_pii row, on the given list. */
  seedOwnerPii(id: string, wishlistId: string): Promise<void>;
  dispose(): Promise<void>;
}
export type ContributionFactory = () => Promise<ContributionFixture>;

const LIST_X = '66666666-6666-7666-8666-666666666600';
const LIST_Y = '66666666-6666-7666-8666-666666666700';
const MIXER = '66666666-6666-7666-8666-666666666601';
const STROLLER = '66666666-6666-7666-8666-666666666602';
const OTHER_LIST_ITEM = '66666666-6666-7666-8666-666666666701';
const PII = '77777777-7777-7777-8777-777777777700';
// Each list's Venmo handle is its own owner_pii row, so the two ids differ.
const LIST_X_VENMO_ROW = '66666666-6666-7666-8666-6666666666a0';
const LIST_Y_VENMO_ROW = '66666666-6666-7666-8666-6666666667a0';

let ids = 0;
let keys = 0;
function pledge(itemId: string, amountMinor: number, idempotencyKey = `idem-${++keys}`, pledgedAt = NOW): Contribution {
  return Contribution.reconstitute({
    id: `00000000-0000-7000-8000-${String(++ids).padStart(12, '0')}`, itemId, amountMinor, sessionHash: SESSION,
    idempotencyKey, guestPiiRef: PII, pledgedAt,
  });
}

export function describeContributionRepositoryContract(adapter: string, factory: ContributionFactory): void {
  describe(`ContributionRepository contract (${adapter})`, () => {
    let fx: ContributionFixture;
    beforeEach(async () => {
      fx = await factory();
      const x = Wishlist.create({ id: LIST_X, slug: 'list-x', title: 'X', ownerToken: 'o-x', key: 'k-x', asOf: NOW, venmoHandle: 'my-venmo' },
        { generateEntityId: () => LIST_X_VENMO_ROW });
      x.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, { generateEntityId: () => MIXER });
      x.addItem({ type: 'group', title: 'Stroller', priceMinor: 60000 }, { generateEntityId: () => STROLLER });
      const y = Wishlist.create({ id: LIST_Y, slug: 'list-y', title: 'Y', ownerToken: 'o-y', key: 'k-y', asOf: NOW, venmoHandle: 'my-venmo' },
        { generateEntityId: () => LIST_Y_VENMO_ROW });
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
        idempotencyKey: inserted.idempotencyKey, guestPiiRef: inserted.guestPiiRef,
      });
      expect(found?.pledgedAt).toEqual(NOW);
    });

    it("round-trips a contribution's ownerPiiRef", async () => {
      const OWNER_PII = '77777777-7777-7777-8777-7777777777b0';
      await fx.seedOwnerPii(OWNER_PII, LIST_X);
      await fx.contributions.insert(Contribution.reconstitute({
        id: '00000000-0000-7000-8000-0000000000b0', itemId: MIXER, amountMinor: 2500, sessionHash: SESSION,
        idempotencyKey: 'key-owner', guestPiiRef: PII, ownerPiiRef: OWNER_PII, pledgedAt: NOW,
      }));

      const [found] = await fx.contributions.findForWishlist(LIST_X);

      expect(found?.ownerPiiRef?.value).toBe(OWNER_PII);
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

    it("findForWishlist returns every contribution on the list's items, oldest pledge first then by id, and none from another list", async () => {
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
  });
}
