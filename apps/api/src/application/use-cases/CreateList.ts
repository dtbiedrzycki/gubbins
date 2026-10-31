import { Wishlist } from '../../domain/entities/Wishlist.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { SecretComparer } from '../ports/SecretComparer.js';
import { PaymentMethods } from '../../domain/value-objects/PaymentMethods.js';
import { DomainValidationError, InvalidCreateSecretError } from '../../domain/errors.js';

export interface CreateListInput {
  listTitle: string;
  listDescription?: string;
  createSecret?: string;
  key: string;
  venmoHandle?: string;
  zelleHandle?: string;
}

export interface CreateListOutput {
  slug: string;
  ownerToken: string;
  key: string;
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
    if (this.createSecret === null || !this.secretComparer.compareInConstantTime(this.createSecret, (input.createSecret ?? '').trim())) {
      throw new InvalidCreateSecretError();
    }
    const chosenKey = input.key.trim();
    if (!this.tokenGenerator.isGuestKey(chosenKey)) {
      throw new DomainValidationError('Choose a guest key from the suggestions');
    }
    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = Wishlist.create({
        id: this.tokenGenerator.generateEntityId(),
        slug: this.tokenGenerator.generateSlug(),
        title: input.listTitle,
        description: input.listDescription,
        ownerToken: this.tokenGenerator.generateOwnerToken(),
        key: chosenKey,
        asOf: this.clock.now(),
        paymentMethods: PaymentMethods.from({ venmoHandle: input.venmoHandle, zelleHandle: input.zelleHandle }),
      });
      await ctx.wishlists.insert(wishlist);

      return {
        slug: wishlist.slug.value,
        ownerToken: wishlist.ownerToken.value,
        key: wishlist.key.value,
      };
    });
  }
}
