import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { WishlistNotFoundError } from '../../domain/errors.js';
import type { MoveTarget } from '../../domain/entities/Wishlist.js';

export interface MoveItemInput {
  wishlistId: string;
  itemId: string;
  to: MoveTarget;
}

export class MoveItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute({ wishlistId, itemId, to }: MoveItemInput, access: AccessContext): Promise<void> {
    // Not the owner is the same as no list (ADR-0016).
    if (!access.owner) throw new WishlistNotFoundError(wishlistId);

    await this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(wishlistId, this.clock.now());
      if (!wishlist) throw new WishlistNotFoundError(wishlistId);
      wishlist.moveItem(itemId, to);
      await ctx.wishlists.save(wishlist);
    });
  }
}
