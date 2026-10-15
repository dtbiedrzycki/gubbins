import type { ItemStatus, ItemType } from '../../domain/entities/Item.js';
import { WishlistNotFoundError } from '../../domain/errors.js';
import type { AccessContext } from '../AccessContext.js';
import type { HoldPolicy } from '../HoldPolicy.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';

export interface ListView {
  title: string;
  items: {
    id: string; title: string; type: ItemType; status: ItemStatus; availableUnits: number; url: string | null; priceMinor: number | null;
    /** Sum of pledges for a group gift; null for a single. */
    pledgedMinor: number | null;
  }[];
  payment: { venmoHandle: string | null; zelleHandle: string | null };
  /** This session's holds on the list, oldest expiry first. */
  myHolds: HoldView[];
  capabilities: { holdDurationDays: number };
}

/**
 * The guest's view of a list, read in one unit of work so the item's status
 * and the guest's holds come from the same snapshot.
 */
export class GetListView {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
    private policy: HoldPolicy,
  ) {}

  async execute(input: { wishlistId: string }, access: AccessContext): Promise<ListView> {
    return this.unitOfWork.execute(async (ctx) => {
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new WishlistNotFoundError(input.wishlistId);

      const mine = access.guestSession ? wishlist.holdsForSession(access.guestSession.sessionHash) : [];

      return {
        title: wishlist.title,
        items: wishlist.items.map((i) => ({
          id: i.id.value, title: i.title, type: i.type, status: wishlist.itemStatus(i.id.value),
          availableUnits: wishlist.availableUnitsOf(i.id.value), url: i.url, priceMinor: i.priceMinor,
          pledgedMinor: i.type === 'group' ? i.pledgedTotal().amountMinor : null,
        })),
        payment: { venmoHandle: wishlist.paymentMethods.venmoHandle, zelleHandle: wishlist.paymentMethods.zelleHandle },
        // Released holds were the guest's own choice and need no follow-up;
        // expired ones stay, since an expired hold can still be purchased while a unit is free.
        myHolds: mine
          .filter((hold) => wishlist.holdStatus(hold) !== 'released')
          .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
          .map((hold) => toHoldView(wishlist, hold)),
        capabilities: { holdDurationDays: this.policy.durationDays },
      };
    });
  }
}
