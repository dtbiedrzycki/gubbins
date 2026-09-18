import type { DomainEvent } from '../ports/EventStore.js';
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
      // An unknown wishlist and an item that isn't in it are the same failure
      // from this use case's contract: there is no such item to hold.
      // getItem is the aggregate's one authorization step for reaching an
      // item at all, so this is the only place that check needs to live.
      const wishlist = await ctx.wishlists.findById(input.wishlistId);
      if (!wishlist) throw new ItemNotFoundError(input.itemId);
      const item = wishlist.getItem(input.itemId);

      // Deliberately before the availability check: a replayed idempotency key
      // must return the original hold, not trip ItemAlreadyHeldError on the
      // hold it created itself.
      const existing = await ctx.holds.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) {
        return { holdId: existing.id, itemId: existing.itemId, expiresAt: existing.expiresAt.toISOString() };
      }

      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);
      const { hold, event, expectedSeq } = item.placeHold({
        holdId: this.tokenGenerator.generateId(),
        secret: this.tokenGenerator.generateHoldSecret(),
        sessionHash: this.hasher.hash(input.sessionId),
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        now,
      }, this.hasher);

      // Cast at the EventStore port boundary only: DomainEvent's index signature
      // exists so the store can hold heterogeneous events, but ItemHeldEvent
      // itself stays free of one, so placeHold's return is still
      // excess-property-checked against the concrete event shape.
      await ctx.eventStore.append(input.itemId, expectedSeq, [event as unknown as DomainEvent]);

      await ctx.holds.recordHold({
        id: hold.id.value, itemId: hold.itemId.value, secret: hold.secret.value,
        sessionHash: hold.sessionHash.value, idempotencyKey: hold.idempotencyKey.value, expiresAt: hold.expiresAt,
      });
      // placeHold has already advanced the in-memory item's seq past
      // expectedSeq, so the persisted row must record that next value, not
      // whatever item.seq happens to read after further calls.
      await ctx.wishlists.markItemHeld(input.wishlistId, input.itemId, expectedSeq + 1);

      return { holdId: hold.id.value, itemId: hold.itemId.value, expiresAt: hold.expiresAt.toISOString() };
    });
  }
}
