import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import type { AccessContext } from '../AccessContext.js';
import { holdDurationMs, type HoldPolicy } from '../HoldPolicy.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';
import { GuestDetails } from '../../domain/value-objects/GuestDetails.js';
import { ItemNotFoundError, ItemUnavailableError } from '../../domain/errors.js';

export interface HoldItemInput {
  wishlistId: string;
  itemId: string;
  idempotencyKey: string;
  name?: string;
  message?: string;
}

export class HoldItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
    /** Only for the ItemHeld secret hash; session hashing happens in presentation. */
    private hasher: Hasher,
    private policy: HoldPolicy,
  ) {}

  async execute(input: HoldItemInput, access: AccessContext): Promise<HoldView> {
    const guest = access.guestSession;
    // Only a keyed-in guest may hold. Presentation already answers a missing
    // session with the generic 404; this keeps the use case safe on its own,
    // failing the same way.
    if (!guest) throw new ItemNotFoundError(input.itemId);

    return this.unitOfWork.execute(async (ctx) => {
      // Read once: the aggregate is loaded as of this instant, its active
      // holds included, and decides everything below at the same one.
      const now = this.clock.now();
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new ItemNotFoundError(input.itemId);
      wishlist.getItem(input.itemId);

      // Deliberately before the availability check: a replayed idempotency
      // key must return the original hold (its current view), not trip
      // ItemUnavailableError on the hold it created itself.
      const existing = await ctx.holds.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) {
        // Another session's key must not hand over that session's hold; refuse
        // it as unavailable. Never fall through to holdItem: UNIQUE (item_id,
        // idempotency_key) would make it a 500.
        if (!existing.belongsToSession(guest.sessionHash)) throw new ItemUnavailableError(input.itemId);
        return toHoldView(wishlist, existing);
      }

      const details = input.name === undefined ? null : GuestDetails.from({ name: input.name, message: input.message });
      // The ref keys a guest_pii row outside the aggregate that the domain never sees (ADR-0057), so the use case mints it beside the insert.
      const pii = details && { id: this.tokenGenerator.generateEntityId(), name: details.name, message: details.message };

      const { hold, item, event, expectedSeq } = wishlist.holdItem({
        itemId: input.itemId,
        sessionHash: guest.sessionHash,
        idempotencyKey: input.idempotencyKey,
        durationMs: holdDurationMs(this.policy),
        piiRef: pii?.id,
      }, this.tokenGenerator, this.hasher);

      // Placing a hold is guest-only (ADR-0075), so the actor is fixed.
      await ctx.eventStore.append(item.id.value, expectedSeq, [event], 'guest');
      // The hold's pii_ref foreign key needs this row to exist first.
      if (pii) await ctx.guestPii.insert(pii);
      await ctx.holds.insert(hold);
      // Persist exactly what the domain decided — the write path never
      // decides availability itself.
      await ctx.wishlists.saveItemState(item);

      return toHoldView(wishlist, hold);
    });
  }
}
