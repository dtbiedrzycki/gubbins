import { Wishlist } from '../../domain/entities/Wishlist.js';
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
        id: this.tokenGenerator.generateEntityId(),
        slug: this.tokenGenerator.generateSlug(),
        title: input.listTitle,
        ownerToken: this.tokenGenerator.generateOwnerToken(),
        key: this.tokenGenerator.generateGuestKey(),
      });
      // Wishlist mints its own item id via the generator it's handed.
      const item = wishlist.addItem({ title: input.itemTitle }, this.tokenGenerator);
      // Attach before insert: the repository persists the aggregate it is
      // handed, so the item must already be part of it.
      await ctx.wishlists.insert(wishlist);

      return {
        slug: wishlist.slug.value,
        ownerToken: wishlist.ownerToken.value,
        key: wishlist.key.value,
        itemId: item.id.value,
      };
    });
  }
}
