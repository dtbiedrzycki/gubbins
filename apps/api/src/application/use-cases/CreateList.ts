import { Wishlist } from '../../domain/entities/Wishlist.js';
import { Item } from '../../domain/entities/Item.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';

export interface CreateListInput {
  listTitle: string;
  itemTitle: string;
}

export interface CreateListOutput {
  slug: string;
  ownerToken: string;
  key: string;
  itemId: string;
}

export class CreateList {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
  ) {}

  async execute(input: CreateListInput): Promise<CreateListOutput> {
    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = Wishlist.create({
        id: this.tokenGenerator.generateId(),
        slug: this.tokenGenerator.generateSlug(),
        title: input.listTitle,
        ownerToken: this.tokenGenerator.generateOwnerToken(),
        key: this.tokenGenerator.generateGuestKey(),
      });
      await ctx.wishlists.insert(wishlist);

      const item = Item.createSingle({
        id: this.tokenGenerator.generateId(),
        wishlistId: wishlist.id,
        title: input.itemTitle,
      });
      await ctx.items.insert(item);

      return { slug: wishlist.slug, ownerToken: wishlist.ownerToken, key: wishlist.key, itemId: item.id };
    });
  }
}
