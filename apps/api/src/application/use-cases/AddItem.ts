import type { AddItemRequest, AddItemResponse } from '@gubbins/shared-types';
import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

export type AddItemInput = { wishlistId: string } & AddItemRequest;

export class AddItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
  ) {}

  async execute({ wishlistId, ...props }: AddItemInput, access: AccessContext): Promise<AddItemResponse> {
    // Not the owner is the same as no list (ADR-0016).
    if (!access.owner) throw new WishlistNotFoundError(wishlistId);

    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(wishlistId, this.clock.now());
      if (!wishlist) throw new WishlistNotFoundError(wishlistId);
      const item = wishlist.addItem(props, this.tokenGenerator);
      await ctx.wishlists.save(wishlist);
      return { itemId: item.id.value };
    });
  }
}
