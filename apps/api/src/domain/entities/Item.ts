import { DomainValidationError, ItemAlreadyHeldError } from '../errors.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import { Hold } from './Hold.js';
import { UuidId } from '../value-objects/UuidId.js';

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
    private _activeHolds: number,
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
    if (type !== 'single') throw new DomainValidationError('Item type must be "single"; this slice supports no other variant');
    if (!Number.isInteger(quantity) || quantity < 1) throw new DomainValidationError('Item quantity must be a positive integer');
    if (!isNonNegativeInteger(_seq)) throw new DomainValidationError('Item seq must be a non-negative integer');
    if (!isNonNegativeInteger(_activeHolds)) throw new DomainValidationError('Item activeHolds must be a non-negative integer');
  }

  static createSingle(props: { id: string; wishlistId: string; title: string }): Item {
    return new Item(UuidId.from(props.id), UuidId.from(props.wishlistId), 'single', props.title.trim(), 1, 0, 0);
  }

  /**
   * Reconstructs an Item from persisted fields, including its concurrency
   * state. `type` and `quantity` are passed through rather than assumed,
   * since `status` derives from `activeHolds >= quantity`: dropping the
   * persisted quantity would silently corrupt availability for any item
   * with more than one unit.
   */
  static reconstitute(props: {
    id: string; wishlistId: string; type: string; title: string; quantity: number; seq: number; activeHolds: number;
  }): Item {
    return new Item(
      UuidId.from(props.id),
      UuidId.from(props.wishlistId),
      // The constructor itself throws DomainValidationError for anything but
      // 'single' (line ~30), so this cast just satisfies the narrower field
      // type; it does not weaken the check. Keeping `props.type` as `string`
      // is what lets infrastructure pass `row.type` straight through without
      // its own `as 'single'` cast silencing the compiler at that boundary.
      props.type as 'single',
      props.title,
      props.quantity,
      props.seq,
      props.activeHolds,
    );
  }

  /**
   * The seq this item was loaded at, from `item_state.seq`. A hold must be
   * appended against this value for the store's optimistic check to accept
   * it. This agrees with the event stream's real position — a `COUNT(*)`
   * over `event_log` — only because one transaction writes both; it is not
   * itself derived from the stream.
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
   * Hold — including its id and secret, which belong to a hold that does
   * not exist yet and so are not the caller's to supply — and the event
   * recording it, then advances this item's own state. The availability
   * rule, the version it is decided against, and the Hold all live here
   * because they are all about this one item — which is also where the
   * event stream's consistency boundary sits (`event_log` is unique on
   * `(item_id, seq)`).
   *
   * Reach an Item through `Wishlist.getItem` rather than loading one
   * directly: the wishlist is what authorizes the caller to act on it.
   *
   * Returns `expectedSeq`, the version the caller must append against — the
   * seq as loaded, before this hold. Persisting the results is the caller's
   * job; this method only decides and records in memory.
   *
   * Mutates this item in place rather than returning a new instance. That is
   * sound only because every aggregate is loaded fresh inside
   * `UnitOfWork.execute` and discarded when the callback returns; the
   * contract assumes a per-transaction instance, not a cached one a later
   * call could reuse.
   */
  placeHold(
    props: {
      sessionHash: string; idempotencyKey: string;
      expiresAt: Date; now: Date;
    },
    /**
     * Taken as structural types, not imported interfaces: domain/ may not
     * import application/ (ADR-012). Same precedent as `Wishlist.addItem`'s
     * id generator and `HoldSecret.matches`'s comparer — the application
     * layer's `TokenGenerator` already satisfies this shape.
     */
    tokens: { generateId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): { hold: Hold; event: ItemHeldEvent; expectedSeq: number } {
    if (this.status === 'held') throw new ItemAlreadyHeldError(this.id.value);

    const hold = Hold.create({
      id: tokens.generateId(),
      itemId: this.id.value,
      secret: tokens.generateHoldSecret(),
      sessionHash: props.sessionHash,
      idempotencyKey: props.idempotencyKey,
      expiresAt: props.expiresAt,
      now: props.now,
    });
    const event: ItemHeldEvent = {
      type: 'ItemHeld',
      itemId: hold.itemId.value,
      holdId: hold.id.value,
      secretHash: hasher.hash(hold.secret.value),
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
