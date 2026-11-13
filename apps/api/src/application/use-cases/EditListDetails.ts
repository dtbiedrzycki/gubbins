import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

export interface EditListDetailsInput {
  wishlistId: string;
  title: string;
  description: string | null;
  theme: string;
}

export class EditListDetails {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute({ wishlistId, theme, ...details }: EditListDetailsInput, access: AccessContext): Promise<void> {
    // Not the owner is the same as no list (ADR-0016).
    if (!access.owner) throw new WishlistNotFoundError(wishlistId);

    await this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(wishlistId, this.clock.now());
      if (!wishlist) throw new WishlistNotFoundError(wishlistId);
      wishlist.changeTheme(theme);
      wishlist.editDetails(details);
      await ctx.wishlists.save(wishlist);
    });
  }
}
