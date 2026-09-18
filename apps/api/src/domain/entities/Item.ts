import { DomainValidationError, ItemAlreadyHeldError } from '../errors.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import { Hold } from './Hold.js';
import { UuidId } from '../value-objects/UuidId.js';

export class Item {
  /**
   * Enforces the entity's invariants, so no construction path — factory or
   * reconstitution from persisted rows — can produce an invalid Item.
   * Input normalization (trimming) belongs to the factories, not here: it
   * cleans what a caller supplied, whereas these checks state what an Item
   * *is*.
   */
  private constructor(
    readonly id: UuidId,
    readonly wishlistId: UuidId,
    readonly type: 'single',
    readonly title: string,
    readonly quantity: number,
    private _seq: number,
    private _activeHolds: number,
  ) {
    if (title.length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
  }

  static createSingle(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(UuidId.from(props.id), UuidId.from(props.wishlistId), 'single', props.title.trim(), 1, 0, 0);
  }

  /** Reconstructs an Item from persisted fields, including its concurrency state. */
  static reconstitute(props: {
    id: string; wishlistId: string; title: string; seq: number; activeHolds: number;
  }): Item {
    return new Item(
      UuidId.from(props.id),
      UuidId.from(props.wishlistId),
      'single',
      props.title,
      1,
      props.seq,
      props.activeHolds,
    );
  }

  /**
   * The version this item's event stream is at, as loaded. A hold must be
   * appended against this seq for the store's optimistic check to accept it.
   */
  get seq(): number {
    return this._seq;
  }

  get activeHolds(): number {
    return this._activeHolds;
  }

  /** Availability under the one rule that decides it: holds against quantity. */
  get status(): 'available' | 'held' {
    return this._activeHolds >= this.quantity ? 'held' : 'available';
  }

  /**
   * Places a hold on this item: decides whether it may be held, mints the
   * Hold and the event recording it, and advances this item's own state.
   * The availability rule, the version it is decided against, and the Hold
   * all live here because they are all about this one item — which is also
   * where the event stream's consistency boundary sits (`event_log` is
   * unique on `(item_id, seq)`).
   *
   * Reach an Item through `Wishlist.getItem` rather than loading one
   * directly: the wishlist is what authorizes the caller to act on it.
   *
   * Returns `expectedSeq`, the version the caller must append against — the
   * seq as loaded, before this hold. Persisting the results is the caller's
   * job; this method only decides and records in memory.
   */
  placeHold(props: {
    holdId: string; secret: string; sessionHash: string; idempotencyKey: string;
    expiresAt: Date; now: Date;
  }): { hold: Hold; event: ItemHeldEvent; expectedSeq: number } {
    if (this.status === 'held') throw new ItemAlreadyHeldError(this.id.value);

    const hold = Hold.create({
      id: props.holdId,
      itemId: this.id.value,
      secret: props.secret,
      sessionHash: props.sessionHash,
      idempotencyKey: props.idempotencyKey,
      expiresAt: props.expiresAt,
      now: props.now,
    });
    const event: ItemHeldEvent = {
      type: 'ItemHeld',
      itemId: hold.itemId.value,
      holdId: hold.id.value,
      secret: hold.secret.value,
      sessionHash: hold.sessionHash.value,
      idempotencyKey: hold.idempotencyKey.value,
      expiresAt: hold.expiresAt.toISOString(),
      occurredAt: props.now.toISOString(),
    };

    const expectedSeq = this._seq;
    this._activeHolds += 1;
    this._seq += 1;
    return { hold, event, expectedSeq };
  }
}
