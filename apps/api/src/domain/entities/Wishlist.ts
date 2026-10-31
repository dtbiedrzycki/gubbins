import { DomainValidationError, HoldNotFoundError, ItemHasGuestHistoryError, ItemNotFoundError, ItemUnavailableError, NoPaymentMethodError } from '../errors.js';
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
import { cleanDescription, Item, type ItemEdit, type ItemStatus } from './Item.js';

const WISHLIST_DESCRIPTION_MAX = 2000; // room for an address and delivery notes; bounds stored input

/** What a hold command returns: the hold it changed, the item whose stream moved, and the event to append at `expectedSeq`. */
export interface HoldCommandResult<E> {
  hold: Hold;
  item: Item;
  event: E;
  expectedSeq: number;
}

/**
 * Aggregate root (ADR-0078). The boundary is Wishlist → Item → Hold /
 * Contribution: items are reachable only through it, and each item holds
 * its own holds and contributions. The wishlist authorizes and owns the
 * rules that span items; each item decides on its own holds and
 * contributions. The use case appends the event a command returns and
 * saves the aggregate.
 *
 * Time enters once, as `asOf` when the aggregate is built or loaded, and
 * every command and status query decides at that instant. None takes a
 * time argument, so no caller can decide on the loaded data using an
 * older or newer date than the one it was loaded at.
 */
export class Wishlist {
  private _items: Item[] = [];
  private _title: string;
  private _description: string | null;

  /**
   * Enforces the aggregate's own invariants, so neither `create` nor
   * `reconstitute` can produce an invalid Wishlist. Blankness is checked
   * against the title's trimmed content; trimming itself stays where the
   * untrusted caller input arrives (`create` and `editDetails`).
   */
  private constructor(
    readonly id: UuidId,
    readonly slug: Slug,
    title: string,
    readonly ownerToken: OwnerToken,
    readonly key: GuestKey,
    readonly keyGen: number,
    private readonly asOf: Date,
    readonly paymentMethods: PaymentMethods = PaymentMethods.none,
    description: string | null = null,
  ) {
    Wishlist.checkDetails(title, description);
    this._title = title;
    this._description = description;
  }

  private static checkDetails(title: string, description: string | null): void {
    if (title.trim().length === 0) throw new DomainValidationError('Wishlist title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Wishlist title must be at most 120 characters');
    if (description !== null && description.length > WISHLIST_DESCRIPTION_MAX) {
      throw new DomainValidationError(`Wishlist description must be at most ${WISHLIST_DESCRIPTION_MAX} characters`);
    }
  }

  get title(): string {
    return this._title;
  }

  get description(): string | null {
    return this._description;
  }

  /** Replaces the title and description, trimmed as at creation; a refused edit leaves the old details. */
  editDetails(props: { title: string; description?: string | null }): void {
    const title = props.title.trim();
    const description = cleanDescription(props.description);
    Wishlist.checkDetails(title, description);
    this._title = title;
    this._description = description;
  }

  /** A new list, deciding as of `asOf`: the instant it is created at. */
  static create(props: { id: string; slug: string; title: string; ownerToken: string; key: string; asOf: Date; paymentMethods?: PaymentMethods;
    description?: string | null }): Wishlist {
    return new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title.trim(),
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), 1, new Date(props.asOf.getTime()), props.paymentMethods,
      cleanDescription(props.description),
    );
  }

  /**
   * Reconstructs a Wishlist from persisted fields — used by repositories,
   * not by creation flows. `asOf` is the instant it was loaded at, and the
   * one every decision is taken at; each item must have been loaded at it.
   */
  static reconstitute(props: {
    id: string; slug: string; title: string; ownerToken: string; key: string; keyGen: number; asOf: Date; paymentMethods?: PaymentMethods; description?: string | null;
    items?: readonly Item[];
  }): Wishlist {
    const items = props.items ?? [];
    if (items.some((item) => item.wishlistId.value !== props.id)) {
      throw new DomainValidationError('Item belongs to a different wishlist');
    }
    if (items.some((item) => !item.isLoadedAt(props.asOf))) {
      throw new DomainValidationError('Item was loaded at a different instant from its wishlist');
    }
    const wishlist = new Wishlist(
      UuidId.from(props.id), Slug.from(props.slug), props.title,
      OwnerToken.from(props.ownerToken), GuestKey.from(props.key), props.keyGen, new Date(props.asOf.getTime()), props.paymentMethods,
      props.description ?? null,
    );
    wishlist._items = [...items];
    return wishlist;
  }

  /**
   * Creates and attaches another item to this wishlist, minting its id via the
   * supplied generator (a structural type: domain/ may not import
   * application/, ADR-0012).
   */
  addItem(
    props: { type: 'single'; title: string; quantity?: number; url?: string | null; priceMinor?: number | null; description?: string | null }
      | { type: 'group'; title: string; priceMinor: number; url?: string | null; description?: string | null },
    ids: { generateEntityId(): string },
  ): Item {
    // Spread last, so a caller passing extra keys can never override what the aggregate assigns.
    const base = { id: ids.generateEntityId(), wishlistId: this.id.value, asOf: this.asOf };
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

  /** Replaces the item with its edited self, where it was; a refused edit leaves the list as it was. */
  editItem(itemId: string, edit: ItemEdit): Item {
    const edited = this.getItem(itemId).edited(edit);
    this._items = this._items.map((item) => (item.id.value === itemId ? edited : item));
    return edited;
  }

  /** Drops an item no guest has acted on; one with any history is refused and kept. */
  removeItem(itemId: string): void {
    if (!this.getItem(itemId).canBeDeleted()) throw new ItemHasGuestHistoryError(itemId);
    this._items = this._items.filter((item) => item.id.value !== itemId);
  }

  /** The items, in the order they were added. */
  get items(): readonly Item[] {
    return this._items;
  }

  /** Every hold on the list's items: what `save` writes. */
  get holds(): readonly Hold[] {
    return this._items.flatMap((item) => item.holds);
  }

  /** Every contribution on the list's items. */
  get contributions(): readonly Contribution[] {
    return this._items.flatMap((item) => item.contributions);
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

  /**
   * The hold with this id on one of the list's items, or null: a hold on
   * another list is never found. The authorization step for holds, as
   * `getItem` is for items.
   */
  findHold(holdId: string): Hold | null {
    for (const item of this._items) {
      const hold = item.findHold(holdId);
      if (hold) return hold;
    }
    return null;
  }

  /**
   * The hold an earlier tap with this key placed on the item, or null if
   * no tap used it. A replay answers with that hold rather than placing
   * another. Another session's key never hands over that session's hold:
   * it is refused like a unit someone else holds.
   */
  findHoldForReplay(itemId: string, idempotencyKey: string, sessionHash: string): Hold | null {
    return this.replayOf(this.getItem(itemId).findHoldWithKey(idempotencyKey), itemId, sessionHash);
  }

  /** `findHoldForReplay`'s rule for a pledge. */
  findContributionForReplay(itemId: string, idempotencyKey: string, sessionHash: string): Contribution | null {
    return this.replayOf(this.getItem(itemId).findContributionWithKey(idempotencyKey), itemId, sessionHash);
  }

  /** Every hold `sessionHash` placed on the list, whatever its state. */
  holdsForSession(sessionHash: string): Hold[] {
    return this.holds.filter((hold) => hold.belongsToSession(sessionHash));
  }

  private replayOf<T extends { belongsToSession(sessionHash: string): boolean }>(found: T | null, itemId: string, sessionHash: string): T | null {
    if (found && !found.belongsToSession(sessionHash)) throw new ItemUnavailableError(itemId);
    return found;
  }

  itemStatus(itemId: string): ItemStatus {
    return this.getItem(itemId).status();
  }

  purchasedCountOf(itemId: string): number {
    return this.getItem(itemId).purchasedCount();
  }

  /**
   * The state of a hold on this list, as of the instant the aggregate was
   * loaded at. Throws HoldNotFoundError for a hold it did not load.
   */
  holdStatus(hold: Hold): HoldStatus {
    return this.memberOf(hold).holdStatus(hold);
  }

  /** `extendHold`'s rule as a question; false for a hold it did not load. */
  canExtendHold(hold: Hold): boolean {
    return this.lookup(hold)?.canExtendHold(hold) ?? false;
  }

  /** `releaseHold`'s rule as a question; false for a hold it did not load. */
  canReleaseHold(hold: Hold): boolean {
    return this.lookup(hold)?.canReleaseHold(hold) ?? false;
  }

  /** `purchaseHold`'s rule as a question, for views that offer the action only when it would succeed; false for a hold it did not load. */
  canPurchaseHold(hold: Hold): boolean {
    return this.lookup(hold)?.canPurchaseHold(hold) ?? false;
  }

  holdItem(
    props: { itemId: string; sessionHash: string; idempotencyKey: string; durationMs: number; piiRef: string },
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): HoldCommandResult<ItemHeldEvent> {
    const item = this.getItem(props.itemId);
    return { item, ...item.placeHold(props, tokens, hasher) };
  }

  pledge(
    props: { itemId: string; amountMinor: number; sessionHash: string; idempotencyKey: string; piiRef: string },
    ids: { generateEntityId(): string },
  ): { contribution: Contribution; item: Item; event: ContributionPledgedEvent; expectedSeq: number } {
    const item = this.getItem(props.itemId);
    return { item, ...item.pledge(props, ids) };
  }

  extendHold(hold: Hold, durationMs: number): HoldCommandResult<HoldExtendedEvent> {
    const item = this.memberOf(hold);
    return { item, ...item.extendHold(hold, durationMs) };
  }

  releaseHold(hold: Hold): HoldCommandResult<HoldReleasedEvent> {
    const item = this.memberOf(hold);
    return { item, ...item.releaseHold(hold) };
  }

  purchaseHold(hold: Hold): HoldCommandResult<ItemPurchasedEvent> {
    const item = this.memberOf(hold);
    return { item, ...item.purchaseHold(hold) };
  }

  /** Units of the item neither under an active hold nor bought. */
  availableUnitsOf(itemId: string): number {
    return this.getItem(itemId).availableUnits();
  }

  /** The item on this list that `hold` is on; HoldNotFoundError when it is not on one. */
  private memberOf(hold: Hold): Item {
    const item = this.lookup(hold);
    if (!item) throw new HoldNotFoundError(hold.id.value);
    return item;
  }

  /** The item on this list that `hold` is on, or null: the authorization step every hold question and command takes before its item decides. */
  private lookup(hold: Hold): Item | null {
    return this._items.find((i) => i.id.value === hold.itemId.value) ?? null;
  }
}
