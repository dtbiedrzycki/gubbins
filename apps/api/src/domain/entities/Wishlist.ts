import { DomainValidationError, HoldNotFoundError, ItemNotFoundError, ItemUnavailableError } from '../errors.js';
import type { HoldExtendedEvent } from '../events/HoldExtendedEvent.js';
import type { HoldReleasedEvent } from '../events/HoldReleasedEvent.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import type { ItemPurchasedEvent } from '../events/ItemPurchasedEvent.js';
import { GuestKey } from '../value-objects/GuestKey.js';
import { OwnerToken } from '../value-objects/OwnerToken.js';
import { Slug } from '../value-objects/Slug.js';
import { UuidId } from '../value-objects/UuidId.js';
import type { Hold } from './Hold.js';
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
 */
export class Wishlist {
  private _item: Item | null = null;
  private _activeHolds: Hold[] = [];

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
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
  }

  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string }): Wishlist {
    return new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title.trim(),
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), 1,
    );
  }

  /**
   * Reconstructs a Wishlist from persisted fields — used by repositories,
   * not by creation flows. `activeHolds` are the list's holds active at load
   * time; each must be on one of this wishlist's items.
   */
  static reconstitute(props: {
    id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number;
    item?: Item; activeHolds?: readonly Hold[];
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
    const wishlist = new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title,
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), props.keyGen,
    );
    wishlist._item = props.item ?? null;
    wishlist._activeHolds = [...holds];
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

  itemStatusAt(itemId: string, at: Date): ItemStatus {
    const item = this.getItem(itemId);
    return item.statusGiven(this.activeHoldsOn(item, at));
  }

  holdItem(
    props: { itemId: string; sessionHash: string; idempotencyKey: string; at: Date; durationMs: number },
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): HoldCommandResult<ItemHeldEvent> {
    const item = this.getItem(props.itemId);
    const { hold, event, expectedSeq } = item.placeHold(props, this.activeHoldsOn(item, props.at), tokens, hasher);
    this._activeHolds.push(hold);
    return { hold, item, event, expectedSeq };
  }

  extendHold(hold: Hold, at: Date, durationMs: number): HoldCommandResult<HoldExtendedEvent> {
    const item = this.itemOf(hold);
    const event = hold.extend(at, durationMs);
    return { hold, item, event, expectedSeq: item.recordEvent() };
  }

  releaseHold(hold: Hold, at: Date): HoldCommandResult<HoldReleasedEvent> {
    const item = this.itemOf(hold);
    const event = hold.release(at);
    return { hold, item, event, expectedSeq: item.recordEvent() };
  }

  /**
   * An active hold may always be purchased — its unit is already its own.
   * An expired one may be too, so a guest who bought the gift after their
   * hold lapsed need not re-hold it — but only while a unit is still
   * free, or they would be buying one someone else now holds.
   */
  purchaseHold(hold: Hold, at: Date): HoldCommandResult<ItemPurchasedEvent> {
    const item = this.itemOf(hold);
    if (hold.statusAt(at) === 'expired' && item.availableUnits(this.activeHoldsOn(item, at)) === 0) {
      throw new ItemUnavailableError(item.id.value);
    }
    const event = hold.markPurchased(at);
    return { hold, item, event, expectedSeq: item.recordPurchase() };
  }

  /** `purchaseHold`'s rule as a question, for views that offer the action only when it would succeed. */
  canPurchaseHold(hold: Hold, at: Date): boolean {
    if (!this.owns(hold)) return false;
    const status = hold.statusAt(at);
    if (status === 'active') return true;
    if (status !== 'expired') return false;
    const item = this.itemOf(hold);
    return item.availableUnits(this.activeHoldsOn(item, at)) > 0;
  }

  /**
   * Re-checked at `at` rather than trusted from the load: the repository
   * returned holds active when it ran, and only `statusAt` defines
   * active.
   */
  private activeHoldsOn(item: Item, at: Date): number {
    return this._activeHolds.filter((hold) => hold.itemId.value === item.id.value && hold.statusAt(at) === 'active').length;
  }

  private itemOf(hold: Hold): Item {
    if (!this.owns(hold)) throw new HoldNotFoundError(hold.id.value);
    return this._item as Item;
  }
}
