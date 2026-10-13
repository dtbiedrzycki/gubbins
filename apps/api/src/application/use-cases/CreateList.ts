import { Wishlist } from '../../domain/entities/Wishlist.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { SecretComparer } from '../ports/SecretComparer.js';
import { InvalidCreateSecretError } from '../../domain/errors.js';

export interface CreateListInput {
  listTitle: string;
  itemTitle: string;
  createSecret?: string;
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
    private clock: Clock,
    private secretComparer: SecretComparer,
    private createSecret: string | null,
  ) {}

  async execute(input: CreateListInput): Promise<CreateListOutput> {
    // Fail closed: no configured secret means no one may create (ADR-0080).
    if (this.createSecret === null || !this.secretComparer.compareInConstantTime(this.createSecret, input.createSecret ?? '')) {
      throw new InvalidCreateSecretError();
    }
    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = Wishlist.create({
        id: this.tokenGenerator.generateEntityId(),
        slug: this.tokenGenerator.generateSlug(),
        title: input.listTitle,
        ownerToken: this.tokenGenerator.generateOwnerToken(),
        key: this.tokenGenerator.generateGuestKey(),
        asOf: this.clock.now(),
      });
      // Wishlist mints its own item id via the generator it's handed.
      const item = wishlist.addItem({ type: 'single', title: input.itemTitle }, this.tokenGenerator);
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
