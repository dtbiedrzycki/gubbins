import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

export interface EditItemInput {
  wishlistId: string;
  itemId: string;
  title: string;
  quantity: number;
  priceMinor?: number;
  url?: string;
  description?: string;
}

export class EditItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute(
    { wishlistId, itemId, title, quantity, priceMinor, url, description }: EditItemInput,
    access: AccessContext,
  ): Promise<void> {
    // Not the owner is the same as no list (ADR-0016).
    if (!access.owner) throw new WishlistNotFoundError(wishlistId);

    await this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(wishlistId, this.clock.now());
      if (!wishlist) throw new WishlistNotFoundError(wishlistId);
      // An absent optional field clears it.
      wishlist.editItem(itemId, {
        title,
        quantity,
        priceMinor: priceMinor ?? null,
        url: url ?? null,
        description: description ?? null,
      });
      await ctx.wishlists.save(wishlist);
    });
  }
}
