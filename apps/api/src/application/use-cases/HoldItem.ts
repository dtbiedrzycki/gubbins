import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import { ItemNotFoundError } from '../../domain/errors.js';

const HOLD_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // ADR-002: 3-day hold

export interface HoldItemInput {
  wishlistId: string;
  itemId: string;
  sessionId: string;
  idempotencyKey: string;
}

export interface HoldItemOutput {
  holdId: string;
  itemId: string;
  expiresAt: string;
}

export class HoldItem {
  constructor(
    private unitOfWork: UnitOfWork,
    private tokenGenerator: TokenGenerator,
    private clock: Clock,
    private hasher: Hasher,
  ) {}

  async execute(input: HoldItemInput): Promise<HoldItemOutput> {
    return this.unitOfWork.execute(async (ctx) => {
      // Read once: the aggregate is loaded as of this instant, its active
      // holds included, and decides everything below at the same one.
      const now = this.clock.now();
      // An unknown wishlist and an item that isn't in it are the same
      // failure from this use case's contract: there is no such item to hold.
      const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
      if (!wishlist) throw new ItemNotFoundError(input.itemId);
      wishlist.getItem(input.itemId);

      // Deliberately before the availability check: a replayed idempotency
      // key must return the original hold, not trip ItemUnavailableError on
      // the hold it created itself.
      const existing = await ctx.holds.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) {
        return { holdId: existing.id.value, itemId: existing.itemId.value, expiresAt: existing.expiresAt.toISOString() };
      }

      const { hold, item, event, expectedSeq } = wishlist.holdItem({
        itemId: input.itemId,
        sessionHash: this.hasher.hash(input.sessionId),
        idempotencyKey: input.idempotencyKey,
        durationMs: HOLD_DURATION_MS,
      }, this.tokenGenerator, this.hasher);

      // Placing a hold is guest-only (ADR-0075), and HoldItem is only ever
      // reached with a guest session, so the actor is fixed here.
      await ctx.eventStore.append(item.id.value, expectedSeq, [event], 'guest');
      await ctx.holds.insert(hold);
      // Persist exactly what the domain decided — the write path never
      // decides availability itself.
      await ctx.wishlists.saveItemState(item);

      return { holdId: hold.id.value, itemId: hold.itemId.value, expiresAt: hold.expiresAt.toISOString() };
    });
  }
}
