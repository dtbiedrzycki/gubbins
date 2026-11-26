import type { PledgeRequest, PledgeResponse } from '@gubbins/shared-types';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { AccessContext } from '../AccessContext.js';
import { GuestDetails } from '../../domain/value-objects/GuestDetails.js';
import { PaymentHandle } from '../../domain/value-objects/PaymentHandle.js';
import type { Contribution } from '../../domain/entities/Contribution.js';
import { ItemNotFoundError } from '../../domain/errors.js';

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

      // Before pledging, so a replayed key answers with the original pledge
      // rather than falling through to the UNIQUE index (a 500).
      const replay = wishlist.findContributionForReplay(input.itemId, input.idempotencyKey, guest.sessionHash);
      if (replay) return toResponse(replay);

      const details = GuestDetails.from({ name: input.name, message: input.message });
      const guestPiiRef = this.tokenGenerator.generateEntityId();
      // What the guest reports paying, recorded without proof (ADR-0090); checked before anything is written.
      const payment = input.payment
        ? { handle: PaymentHandle.from(input.payment.method, input.payment.handle), ref: this.tokenGenerator.generateEntityId() }
        : undefined;

      const { contribution, item, event, expectedSeq } = wishlist.pledge({
        itemId: input.itemId,
        amountMinor: input.amountMinor,
        sessionHash: guest.sessionHash,
        idempotencyKey: input.idempotencyKey,
        guestPiiRef,
        ownerPiiRef: payment?.ref,
      }, this.tokenGenerator);

      await ctx.eventStore.append(item.id.value, expectedSeq, [event], 'guest');
      // The contribution's guest_pii_ref and owner_pii_ref foreign keys need these rows first.
      await ctx.guestPii.insert(guestPiiRef, details);
      if (payment) await ctx.ownerPii.insert(payment.ref, input.wishlistId, payment.handle);
      await ctx.wishlists.save(wishlist);

      return toResponse(contribution);
    });
  }
}
