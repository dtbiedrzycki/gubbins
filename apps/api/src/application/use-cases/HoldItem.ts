import { Hold } from '../../domain/entities/Hold.js';
import type { ItemHeldEvent } from '../../domain/events/ItemHeldEvent.js';
import type { DomainEvent } from '../ports/EventStore.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { TokenGenerator } from '../ports/TokenGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import { ItemNotFoundError, ItemAlreadyHeldError } from '../../domain/errors.js';

const HOLD_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // ADR-002: 3-day hold

export interface HoldItemInput {
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
      const item = await ctx.items.findById(input.itemId);
      if (!item) throw new ItemNotFoundError(input.itemId);

      const existing = await ctx.holds.findByIdempotencyKey(input.itemId, input.idempotencyKey);
      if (existing) {
        return { holdId: existing.id, itemId: existing.itemId, expiresAt: existing.expiresAt.toISOString() };
      }

      const state = await ctx.items.getState(input.itemId);
      if (state.activeHolds >= item.quantity) {
        throw new ItemAlreadyHeldError(input.itemId);
      }

      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + HOLD_DURATION_MS);
      const hold = Hold.create({
        id: this.tokenGenerator.generateId(),
        itemId: input.itemId,
        secret: this.tokenGenerator.generateHoldSecret(),
        sessionHash: this.hasher.hash(input.sessionId),
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        now,
      });

      const event: ItemHeldEvent = {
        type: 'ItemHeld',
        itemId: hold.itemId,
        holdId: hold.id,
        secret: hold.secret,
        sessionHash: hold.sessionHash,
        idempotencyKey: hold.idempotencyKey,
        expiresAt: hold.expiresAt.toISOString(),
        occurredAt: now.toISOString(),
      };
      // Cast at the EventStore port boundary only: DomainEvent's index signature
      // exists so the store can hold heterogeneous events, but ItemHeldEvent
      // itself stays free of one, so this literal's assignment above is still
      // excess-property-checked against the concrete event shape.
      await ctx.eventStore.append(input.itemId, state.seq, [event as unknown as DomainEvent]);

      await ctx.holds.recordHold({
        id: hold.id, itemId: hold.itemId, secret: hold.secret,
        sessionHash: hold.sessionHash, idempotencyKey: hold.idempotencyKey, expiresAt: hold.expiresAt,
      });
      await ctx.items.markHeld(input.itemId, state.seq + 1);

      return { holdId: hold.id, itemId: hold.itemId, expiresAt: hold.expiresAt.toISOString() };
    });
  }
}
