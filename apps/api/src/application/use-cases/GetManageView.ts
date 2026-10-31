import type { ItemType } from '../../domain/entities/Item.js';
import { WishlistNotFoundError } from '../../domain/errors.js';
import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';

export interface ManageView {
  title: string;
  description: string | null;
  key: string;
  items: {
    id: string; type: ItemType; title: string; quantity: number; priceMinor: number | null; url: string | null; description: string | null;
    /** True while no guest has acted on it; only then may it be deleted. */
    deletable: boolean;
    committedUnits: number;
    /** Sum of pledges for a group gift; null for a single. */
    pledgedMinor: number | null;
  }[];
}

/** The owner's view of a list: everything the manage page needs to edit it, from one load. */
export class GetManageView {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute(input: { wishlistId: string }, access: AccessContext): Promise<ManageView> {
    // Not the owner is the same as no list (ADR-0016).
    if (!access.owner) throw new WishlistNotFoundError(input.wishlistId);

    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(input.wishlistId, this.clock.now());
      if (!wishlist) throw new WishlistNotFoundError(input.wishlistId);

      return {
        title: wishlist.title,
        description: wishlist.description,
        key: wishlist.key.value,
        items: wishlist.items.map((i) => ({
          id: i.id.value, type: i.type, title: i.title, quantity: i.quantity, priceMinor: i.priceMinor, url: i.url, description: i.description,
          deletable: i.canBeDeleted(), committedUnits: i.committedUnits(),
          pledgedMinor: i.type === 'group' ? i.pledgedTotal().amountMinor : null,
        })),
      };
    });
  }
}
