import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import type { AccessContext } from '../AccessContext.js';
import { holdDurationMs, type HoldPolicy } from '../HoldPolicy.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';
import type { HoldItemInput } from './HoldItem.js';
import { GuestDetails } from '../../domain/value-objects/GuestDetails.js';
import { ItemNotFoundError } from '../../domain/errors.js';

export interface BuyItemInput extends HoldItemInput {
  message?: string;
}

/** A guest holds and buys a gift in one step: the hold and its purchase are born together. */
export class BuyItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
    /** Only for the ItemHeld secret hash; session hashing happens in presentation. */
    private hasher: Hasher,
    private policy: HoldPolicy,
  ) {}

  async execute(input: BuyItemInput, access: AccessContext): Promise<HoldView> {
    const guest = access.guestSession;
    // Only a keyed-in guest may buy. Presentation already answers a missing
    // session with the generic 404; this keeps the use case safe on its own,
    // failing the same way.
    if (!guest) throw new ItemNotFoundError(input.itemId);

    return this.unitOfWork.execute(async (ctx) => {
      // Read once: the aggregate is loaded as of this instant and decides everything below at the same one.
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new ItemNotFoundError(input.itemId);

      // Before buying, so a replayed key answers with the purchase it made,
      // not ItemUnavailableError on that very hold. Never fall through to
      // buyItem on a replay: UNIQUE (item_id, idempotency_key) would make it a 500.
      const replay = wishlist.findHoldForReplay(input.itemId, input.idempotencyKey, guest.sessionHash);
      if (replay) return toHoldView(wishlist, replay);

      // Built before anything is written, so an invalid message buys nothing.
      const details = GuestDetails.from({ name: input.name, message: input.message });
      // The ref keys a guest_pii row outside the aggregate that the domain never sees (ADR-0057), so the use case mints it beside the insert.
      const piiRef = this.tokenGenerator.generateEntityId();

      const { hold, item, events, expectedSeq } = wishlist.buyItem({
        itemId: input.itemId,
        sessionHash: guest.sessionHash,
        idempotencyKey: input.idempotencyKey,
        durationMs: holdDurationMs(this.policy),
        piiRef,
        units: input.units,
      }, this.tokenGenerator, this.hasher);

      // Buying is guest-only (ADR-0075), so the actor is fixed.
      await ctx.eventStore.append(item.id.value, expectedSeq, events, 'guest');
      // The hold's pii_ref foreign key needs this row to exist first.
      await ctx.guestPii.insert(piiRef, details);
      // Persist exactly what the domain decided.
      await ctx.wishlists.save(wishlist);

      return toHoldView(wishlist, hold);
    });
  }
}
