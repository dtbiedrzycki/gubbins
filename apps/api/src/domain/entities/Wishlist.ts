import { DomainValidationError, HoldLapsedError, HoldNotActiveError, HoldNotFoundError, ItemNotFoundError, NoPaymentMethodError } from '../errors.js';
import type { ContributionPledgedEvent } from '../events/ContributionPledgedEvent.js';
import type { HoldExtendedEvent } from '../events/HoldExtendedEvent.js';
import type { HoldReleasedEvent } from '../events/HoldReleasedEvent.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import type { ItemPurchasedEvent } from '../events/ItemPurchasedEvent.js';
import { GuestKey } from '../value-objects/GuestKey.js';
import { OwnerToken } from '../value-objects/OwnerToken.js';
import { PaymentMethods } from '../value-objects/PaymentMethods.js';
import { Slug } from '../value-objects/Slug.js';
import { UuidId } from '../value-objects/UuidId.js';
import type { Contribution } from './Contribution.js';
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
 * carries the list's holds that were active or purchased as of the instant
 * it was loaded, so every rule that needs to see other holds — availability
 * today, a per-session cap later — is decided here, and the purchased count
 * is the number of those holds marked purchased. Holds
 * are their own aggregate: the wishlist authorizes and decides commands on
 * them; the use case persists the outcome.
 *
 * Time enters once, as `asOf` when the aggregate is built or loaded, and
 * every command and status query decides at that instant. None takes a
 * time argument, so no caller can decide on the loaded data using an
 * older or newer date than the one it was loaded at.
 */
export class Wishlist {
  private _items: Item[] = [];
  private _holds: Hold[] = [];

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
    readonly paymentMethods: PaymentMethods = PaymentMethods.none,
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
  }

  /** A new list, deciding as of `asOf`: the instant it is created at. */
  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string; asOf: Date; paymentMethods?: PaymentMethods }): Wishlist {
    return new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title.trim(),
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), 1, new Date(props.asOf.getTime()), props.paymentMethods,
    );
  }

  /**
   * Reconstructs a Wishlist from persisted fields — used by repositories,
   * not by creation flows. `asOf` is the instant it was loaded at, and the
   * one every decision is taken at; `holds` are the list's holds active or
   * purchased at it, each on one of this wishlist's items.
   */
  static reconstitute(props: {
    id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number; asOf: Date; paymentMethods?: PaymentMethods;
    items?: readonly Item[]; holds?: readonly Hold[];
  }): Wishlist {
    const items = props.items ?? [];
    if (items.some((item) => item.wishlistId.value !== props.id)) {
      throw new DomainValidationError('Item belongs to a different wishlist');
    }
    const holds = props.holds ?? [];
    for (const hold of holds) {
      if (!items.some((item) => item.id.value === hold.itemId.value)) {
        throw new DomainValidationError('Hold belongs to an item outside this wishlist');
      }
    }
    const wishlist = new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title,
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), props.keyGen, new Date(props.asOf.getTime()), props.paymentMethods,
    );
    wishlist._items = [...items];
    wishlist._holds = [...holds];
    return wishlist;
  }

  /**
   * Creates and attaches another item to this wishlist, minting its id via the
   * supplied generator (a structural type: domain/ may not import
   * application/, ADR-0012).
   */
  addItem(
    props: { type: 'single'; title: string; quantity?: number; url?: string | null; priceMinor?: number | null }
      | { type: 'group'; title: string; priceMinor: number; url?: string | null },
    ids: { generateEntityId(): string },
  ): Item {
    // Spread last, so a caller passing extra keys can never override what the aggregate assigns.
    const base = { id: ids.generateEntityId(), wishlistId: this.id.value };
    let item: Item;
    if (props.type === 'group') {
      if (this.paymentMethods.isEmpty()) throw new NoPaymentMethodError();
      item = Item.createGroup({ ...props, ...base });
    } else {
      item = Item.createSingle({ ...props, ...base });
    }
    this._items.push(item);
    return item;
  }

  /** The items, in the order they were added. */
  get items(): readonly Item[] {
    return this._items;
  }

  /** First item; removed once the list view reads `items`. */
  get item(): Item | null {
    return this._items[0] ?? null;
  }

  /**
   * Resolves `itemId` to the Item this wishlist owns, or throws
   * ItemNotFoundError — the aggregate's authorization step for items.
   */
  getItem(itemId: string): Item {
    const item = this._items.find((i) => i.id.value === itemId);
    if (item === undefined) throw new ItemNotFoundError(itemId);
    return item;
  }

  /** The loaded instance of an active or purchased hold, or null — a hold not in the snapshot is released or expired. */
  findHold(holdId: string): Hold | null {
    return this._holds.find((hold) => hold.id.value === holdId) ?? null;
  }

  /** Whether `hold` is on one of this wishlist's items: the authorization step for a hold loaded by id, as `getItem` is for items. */
  owns(hold: Hold): boolean {
    return this._items.some((i) => i.id.value === hold.itemId.value);
  }

  itemStatus(itemId: string): ItemStatus {
    const item = this.getItem(itemId);
    return item.statusGiven(this.activeHoldsOn(item), this.purchasedCountOf(item.id.value));
  }

  /** Units of the item bought: its loaded holds that are purchased, including any purchased through this aggregate since. */
  purchasedCountOf(itemId: string): number {
    return this._holds.filter((hold) => hold.itemId.value === itemId && hold.statusAt(this.asOf) === 'purchased').length;
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
    props: { itemId: string; sessionHash: string; idempotencyKey: string; durationMs: number; piiRef?: string },
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): HoldCommandResult<ItemHeldEvent> {
    const item = this.getItem(props.itemId);
    const { hold, event, expectedSeq } = item.placeHold({ ...props, at: this.asOf }, this.activeHoldsOn(item), this.purchasedCountOf(item.id.value), tokens, hasher);
    this._holds.push(hold);
    return { hold, item, event, expectedSeq };
  }

  pledge(
    props: { itemId: string; amountMinor: number; sessionHash: string; idempotencyKey: string; piiRef: string },
    ids: { generateEntityId(): string },
  ): { contribution: Contribution; item: Item; event: ContributionPledgedEvent; expectedSeq: number } {
    const item = this.getItem(props.itemId);
    return { item, ...item.pledge({ ...props, at: this.asOf }, ids) };
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
    if (refusal === 'lapsed') throw new HoldLapsedError(item.id.value);
    const event = hold.markPurchased(this.asOf);
    this.keep(hold);
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
    return this.availableUnitsOf(hold.itemId.value) === 0 ? 'lapsed' : null;
  }

  /** Units of the item neither under an active hold nor bought. */
  availableUnitsOf(itemId: string): number {
    const item = this.getItem(itemId);
    return item.availableUnits(this.activeHoldsOn(item), this.purchasedCountOf(item.id.value));
  }

  /**
   * Re-checked at `asOf` rather than trusted from the load: the repository
   * filtered in its own terms, and only `statusAt` defines active.
   */
  private activeHoldsOn(item: Item): number {
    return this._holds.filter((hold) => hold.itemId.value === item.id.value && hold.statusAt(this.asOf) === 'active').length;
  }

  /** Makes the aggregate's holds include `hold`, in place of any loaded copy of it: an expired hold arrives from outside the load. */
  private keep(hold: Hold): void {
    const index = this._holds.findIndex((loaded) => loaded.id.value === hold.id.value);
    if (index === -1) this._holds.push(hold);
    else this._holds[index] = hold;
  }

  private itemOf(hold: Hold): Item {
    const item = this._items.find((i) => i.id.value === hold.itemId.value);
    if (item === undefined) throw new HoldNotFoundError(hold.id.value);
    return item;
  }
}
