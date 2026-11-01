import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

export interface DeleteItemInput {
  wishlistId: string;
  itemId: string;
}

export class DeleteItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute({ wishlistId, itemId }: DeleteItemInput, access: AccessContext): Promise<void> {
    // Not the owner is the same as no list (ADR-0016).
    if (!access.owner) throw new WishlistNotFoundError(wishlistId);

    await this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(wishlistId, this.clock.now());
      if (!wishlist) throw new WishlistNotFoundError(wishlistId);
      wishlist.removeItem(itemId);
      await ctx.wishlists.save(wishlist);
    });
  }
}
