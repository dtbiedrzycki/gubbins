import type { PledgeRequest, PledgeResponse } from '@gubbins/shared-types';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { AccessContext } from '../AccessContext.js';
import { GuestDetails } from '../../domain/value-objects/GuestDetails.js';
import type { Contribution } from '../../domain/entities/Contribution.js';
import { ItemNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

export type PledgeContributionInput = { wishlistId: string; itemId: string } & PledgeRequest;

const toResponse = (c: Contribution): PledgeResponse =>
  ({ contributionId: c.id.value, itemId: c.itemId.value, amountMinor: c.amount.amountMinor });

export class PledgeContribution {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
  ) {}

  async execute(input: PledgeContributionInput, access: AccessContext): Promise<PledgeResponse> {
    const guest = access.guestSession;
    // Only a keyed-in guest may pledge; fails like any unknown item.
    if (!guest) throw new ItemNotFoundError(input.itemId);

    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(input.wishlistId, this.clock.now());
      if (!wishlist) throw new ItemNotFoundError(input.itemId);
      wishlist.getItem(input.itemId);

      // Before the domain command, so a replay returns the original. Another
      // session's key is refused: falling through would hit the UNIQUE index (a 500).
      const existing = await ctx.contributions.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) {
        if (!existing.belongsToSession(guest.sessionHash)) throw new ItemUnavailableError(input.itemId);
        return toResponse(existing);
      }

      const details = GuestDetails.from({ name: input.name, message: input.message });
      const piiRef = this.tokenGenerator.generateEntityId();

      const { contribution, item, event, expectedSeq } = wishlist.pledge({
        itemId: input.itemId,
        amountMinor: input.amountMinor,
        sessionHash: guest.sessionHash,
        idempotencyKey: input.idempotencyKey,
        piiRef,
      }, this.tokenGenerator);

      await ctx.eventStore.append(item.id.value, expectedSeq, [event], 'guest');
      // The contribution's pii_ref foreign key needs this row first.
      await ctx.guestPii.insert({ id: piiRef, name: details.name, message: details.message });
      await ctx.contributions.insert(contribution);
      await ctx.wishlists.saveItemState(item);

      return toResponse(contribution);
    });
  }
}
