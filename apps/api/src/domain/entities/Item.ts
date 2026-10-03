import { DomainValidationError, ItemUnavailableError } from '../errors.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import { Hold } from './Hold.js';
import { UuidId } from '../value-objects/UuidId.js';

export type ItemStatus = 'available' | 'held' | 'purchased';

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export class Item {
  /**
   * Enforces the entity's invariants, so no construction path — factory or
   * reconstitution from persisted rows — can produce an invalid Item. Titles
   * are validated for blankness against their trimmed content, but the
   * stored value is not itself normalized here: normalization (trimming)
   * belongs to the factories, which clean what a caller supplied, whereas
   * these checks state what an Item *is*.
   */
  private constructor(
    readonly id: UuidId,
    readonly wishlistId: UuidId,
    readonly type: 'single',
    readonly title: string,
    readonly quantity: number,
    private _seq: number,
    private _purchasedCount: number,
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
    if (type !== 'single') throw new DomainValidationError('Item type must be "single"; this slice supports no other variant');
    if (!Number.isInteger(quantity) || quantity < 1) throw new DomainValidationError('Item quantity must be a positive integer');
    if (!isNonNegativeInteger(_seq)) throw new DomainValidationError('Item seq must be a non-negative integer');
    if (!isNonNegativeInteger(_purchasedCount)) throw new DomainValidationError('Item purchasedCount must be a non-negative integer');
  }

  static createSingle(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(UuidId.from(props.id), UuidId.from(props.wishlistId), 'single', props.title.trim(), 1, 0, 0);
  }

  /**
   * Reconstructs an Item from persisted fields. `type` stays a `string` so
   * infrastructure can pass `row.type` straight through; the constructor
   * rejects anything but 'single', so the cast below weakens nothing.
   */
  static reconstitute(props: {
    id: string; wishlistId: string; type: string; title: string; quantity: number; seq: number; purchasedCount: number;
  }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), props.type as 'single',
      props.title, props.quantity, props.seq, props.purchasedCount,
    );
  }

  /**
   * The seq this item's stream is at, from `item_state.seq`. Appends must
   * use the value `recordEvent` hands back for the store's optimistic check
   * (ADR-0010) to accept them.
   */
  get seq(): number {
    return this._seq;
  }

  /** Units bought. Purchase is terminal, so this only grows — safe to store, unlike an active-hold count. */
  get purchasedCount(): number {
    return this._purchasedCount;
  }

  /**
   * Units no one holds or has bought, given how many holds on this item are
   * active at the wishlist's instant. The count comes from the caller — the Wishlist, which
   * carries the list's active holds — because liveness belongs to hold rows,
   * never to a counter here. Never negative: quantity may drop below
   * what is already committed (ADR-0019).
   */
  availableUnits(activeHolds: number): number {
    return Math.max(0, this.quantity - activeHolds - this._purchasedCount);
  }

  statusGiven(activeHolds: number): ItemStatus {
    if (this.availableUnits(activeHolds) > 0) return 'available';
    return this._purchasedCount >= this.quantity ? 'purchased' : 'held';
  }

  /**
   * Decides whether a unit is free, mints the Hold — its id and secret
   * belong to a hold that does not exist yet, so they are not the caller's
   * to supply — and the event recording it, then advances this item's
   * stream. Reach it through `Wishlist.holdItem`, which supplies
   * `activeHolds`, authorizes the caller and passes as `at` the instant it
   * was loaded at; application code never calls this directly.
   *
   * Collaborators are structural types: domain/ may not import
   * application/ (ADR-0012), and the application layer's TokenGenerator and
   * Hasher already satisfy these shapes.
   */
  placeHold(
    props: { sessionHash: string; idempotencyKey: string; at: Date; durationMs: number },
    activeHolds: number,
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): { hold: Hold; event: ItemHeldEvent; expectedSeq: number } {
    if (this.availableUnits(activeHolds) === 0) throw new ItemUnavailableError(this.id.value);

    const hold = Hold.create({
      id: tokens.generateEntityId(),
      itemId: this.id.value,
      secret: tokens.generateHoldSecret(),
      sessionHash: props.sessionHash,
      idempotencyKey: props.idempotencyKey,
      expiresAt: new Date(props.at.getTime() + props.durationMs),
      now: props.at,
    });
    const event: ItemHeldEvent = {
      type: 'ItemHeld',
      v: 1,
      itemId: hold.itemId.value,
      holdId: hold.id.value,
      secretHash: hasher.hash(hold.secret.value),
      sessionHash: hold.sessionHash.value,
      idempotencyKey: hold.idempotencyKey.value,
      expiresAt: hold.expiresAt.toISOString(),
      occurredAt: props.at.toISOString(),
    };
    return { hold, event, expectedSeq: this.recordEvent() };
  }

  /**
   * Advances the stream by one event and returns the seq it was at — the
   * value to append against. Every command on a hold of this item records
   * through here, since they all share the item's stream (ADR-0008).
   */
  recordEvent(): number {
    const expectedSeq = this._seq;
    this._seq += 1;
    return expectedSeq;
  }

  /** One more unit gone for good, recorded as one more event. */
  recordPurchase(): number {
    this._purchasedCount += 1;
    return this.recordEvent();
  }
}
