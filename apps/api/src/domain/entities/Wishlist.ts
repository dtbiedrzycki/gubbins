import { DomainValidationError, HoldNotActiveError, HoldNotFoundError, ItemNotFoundError, ItemUnavailableError } from '../errors.js';
import type { HoldExtendedEvent } from '../events/HoldExtendedEvent.js';
import type { HoldReleasedEvent } from '../events/HoldReleasedEvent.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import type { ItemPurchasedEvent } from '../events/ItemPurchasedEvent.js';
import { GuestKey } from '../value-objects/GuestKey.js';
import { OwnerToken } from '../value-objects/OwnerToken.js';
import { Slug } from '../value-objects/Slug.js';
import { UuidId } from '../value-objects/UuidId.js';
import type { Hold, HoldStatus } from './Hold.js';
import { Item, type ItemStatus } from './Item.js';

/** What a hold command leaves for the use case to persist: the hold, the item whose state moved, and the event to append at `expectedSeq`. */
export interface HoldCommandResult<E> {
  hold: Hold;
  item: Item;
  event: E;
  expectedSeq: number;
}

/**
 * Aggregate root (ADR-0078). Items are reachable only through it, and it
 * carries the list's *active* holds as of the instant it was loaded,
 * so every rule that needs to see other holds — availability today, a
 * per-session cap later — is decided here. Holds
 * are their own aggregate: the wishlist authorizes and decides commands on
 * them; the use case persists the outcome.
 *
 * Time enters once, as `asOf` when the aggregate is built or loaded, and
 * every command and status query decides at that instant. None takes a
 * time argument, so no caller can decide on the loaded data using an
 * older or newer date than the one it was loaded at.
 */
export class Wishlist {
  private _item: Item | null = null;
  private _activeHolds: Hold[] = [];
  /** Purchased holds per item id, as loaded and since bumped by `purchaseHold`. */
  private _purchasedCounts = new Map<string, number>();

  /**
   * Enforces the aggregate's own invariants, so neither `create` nor
   * `reconstitute` can produce an invalid Wishlist. Blankness is checked
   * against the title's trimmed content; trimming itself stays in `create`,
   * where the untrusted caller input arrives.
   */
  private constructor(
    readonly id: UuidId,
    readonly slug: Slug,
    readonly title: string,
    readonly ownerToken: OwnerToken,
    readonly key: GuestKey,
    readonly keyGen: number,
    private readonly asOf: Date,
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
  }

  /** A new list, deciding as of `asOf`: the instant it is created at. */
  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string; asOf: Date }): Wishlist {
    return new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title.trim(),
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), 1, new Date(props.asOf.getTime()),
    );
  }

  /**
   * Reconstructs a Wishlist from persisted fields — used by repositories,
   * not by creation flows. `asOf` is the instant it was loaded at, and the
   * one every decision is taken at; `activeHolds` are the list's holds
   * active at it, each on one of this wishlist's items. `purchasedCounts`
   * maps an item id to how many of its holds were purchased; an item with
   * no entry has none.
   */
  static reconstitute(props: {
    id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number; asOf: Date;
    item?: Item; activeHolds?: readonly Hold[]; purchasedCounts?: ReadonlyMap<string, number>;
  }): Wishlist {
    if (props.item && props.item.wishlistId.value !== props.id) {
      throw new DomainValidationError('Item belongs to a different wishlist');
    }
    const holds = props.activeHolds ?? [];
    for (const hold of holds) {
      if (!props.item || hold.itemId.value !== props.item.id.value) {
        throw new DomainValidationError('Hold belongs to an item outside this wishlist');
      }
    }
    for (const [itemId, count] of props.purchasedCounts ?? []) {
      if (!props.item || itemId !== props.item.id.value) {
        throw new DomainValidationError('Purchased count belongs to an item outside this wishlist');
      }
      if (!Number.isInteger(count) || count < 0) {
        throw new DomainValidationError('Purchased count must be a non-negative integer');
      }
    }
    const wishlist = new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title,
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), props.keyGen, new Date(props.asOf.getTime()),
    );
    wishlist._item = props.item ?? null;
    wishlist._activeHolds = [...holds];
    wishlist._purchasedCounts = new Map(props.purchasedCounts);
    return wishlist;
  }

  /**
   * Creates and attaches this wishlist's item, minting its id via the
   * supplied generator (a structural type: domain/ may not import
   * application/, ADR-0012).
   */
  addItem(props: { title: string }, ids: { generateEntityId(): string }): Item {
    if (this._item !== null) {
      throw new DomainValidationError('Wishlist already has an item; this slice supports a single item per wishlist');
    }
    this._item = Item.createSingle({ id: ids.generateEntityId(), wishlistId: this.id.value, title: props.title });
    return this._item;
  }

  get item(): Item | null {
    return this._item;
  }

  /**
   * Resolves `itemId` to the Item this wishlist owns, or throws
   * ItemNotFoundError — the aggregate's authorization step for items.
   */
  getItem(itemId: string): Item {
    if (this._item === null || this._item.id.value !== itemId) {
      throw new ItemNotFoundError(itemId);
    }
    return this._item;
  }

  /** The loaded instance of an active hold, or null — a hold not in the snapshot is expired or closed. */
  findHold(holdId: string): Hold | null {
    return this._activeHolds.find((hold) => hold.id.value === holdId) ?? null;
  }

  /** Whether `hold` is on one of this wishlist's items: the authorization step for a hold loaded by id, as `getItem` is for items. */
  owns(hold: Hold): boolean {
    return this._item !== null && hold.itemId.value === this._item.id.value;
  }

  itemStatus(itemId: string): ItemStatus {
    const item = this.getItem(itemId);
    return item.statusGiven(this.activeHoldsOn(item), this.purchasedCountOf(item.id.value));
  }

  /** Units of the item bought, as loaded plus any purchase made through this aggregate since. */
  purchasedCountOf(itemId: string): number {
    return this._purchasedCounts.get(itemId) ?? 0;
  }

  /**
   * The state of a hold on this list, as of the instant the aggregate was
   * loaded at. Throws HoldNotFoundError for another list's hold.
   */
  holdStatus(hold: Hold): HoldStatus {
    this.itemOf(hold);
    return hold.statusAt(this.asOf);
  }

  /** `extendHold`'s rule as a question; false for another list's hold. */
  canExtendHold(hold: Hold): boolean {
    return this.owns(hold) && hold.canExtendAt(this.asOf);
  }

  /** `releaseHold`'s rule as a question; false for another list's hold. */
  canReleaseHold(hold: Hold): boolean {
    return this.owns(hold) && hold.canReleaseAt(this.asOf);
  }

  holdItem(
    props: { itemId: string; sessionHash: string; idempotencyKey: string; durationMs: number },
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): HoldCommandResult<ItemHeldEvent> {
    const item = this.getItem(props.itemId);
    const { hold, event, expectedSeq } = item.placeHold({ ...props, at: this.asOf }, this.activeHoldsOn(item), this.purchasedCountOf(item.id.value), tokens, hasher);
    this._activeHolds.push(hold);
    return { hold, item, event, expectedSeq };
  }

  extendHold(hold: Hold, durationMs: number): HoldCommandResult<HoldExtendedEvent> {
    const item = this.itemOf(hold);
    const event = hold.extend(this.asOf, durationMs);
    return { hold, item, event, expectedSeq: item.recordEvent() };
  }

  releaseHold(hold: Hold): HoldCommandResult<HoldReleasedEvent> {
    const item = this.itemOf(hold);
    const event = hold.release(this.asOf);
    return { hold, item, event, expectedSeq: item.recordEvent() };
  }

  /**
   * An active hold may always be purchased — its unit is already its own.
   * An expired one may be too, so a guest who bought the gift after their
   * hold lapsed need not re-hold it — but only while a unit is still
   * free, or they would be buying one someone else now holds.
   */
  purchaseHold(hold: Hold): HoldCommandResult<ItemPurchasedEvent> {
    const item = this.itemOf(hold);
    const refusal = this.purchaseRefusal(hold);
    if (refusal === 'closed') throw new HoldNotActiveError(hold.id.value);
    if (refusal === 'lapsed') throw new ItemUnavailableError(item.id.value);
    const event = hold.markPurchased(this.asOf);
    this._purchasedCounts.set(item.id.value, this.purchasedCountOf(item.id.value) + 1);
    return { hold, item, event, expectedSeq: item.recordEvent() };
  }

  /** `purchaseHold`'s rule as a question, for views that offer the action only when it would succeed. */
  canPurchaseHold(hold: Hold): boolean {
    return this.owns(hold) && this.purchaseRefusal(hold) === null;
  }

  /** Why `purchaseHold` would refuse `hold`, or null when it would succeed. Assumes the hold is on this list. */
  private purchaseRefusal(hold: Hold): 'closed' | 'lapsed' | null {
    const status = hold.statusAt(this.asOf);
    if (status === 'active') return null;
    if (status !== 'expired') return 'closed';
    return this.availableUnitsOf(this.itemOf(hold)) === 0 ? 'lapsed' : null;
  }

  private availableUnitsOf(item: Item): number {
    return item.availableUnits(this.activeHoldsOn(item), this.purchasedCountOf(item.id.value));
  }

  /**
   * Re-checked at `asOf` rather than trusted from the load: the repository
   * filtered in its own terms, and only `statusAt` defines active.
   */
  private activeHoldsOn(item: Item): number {
    return this._activeHolds.filter((hold) => hold.itemId.value === item.id.value && hold.statusAt(this.asOf) === 'active').length;
  }

  private itemOf(hold: Hold): Item {
    if (!this.owns(hold)) throw new HoldNotFoundError(hold.id.value);
    return this._item as Item;
  }
}
