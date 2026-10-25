import { ContributionAmountError, DomainValidationError, HoldLapsedError, HoldNotActiveError, HoldNotFoundError, ItemUnavailableError } from '../errors.js';
import type { ContributionPledgedEvent } from '../events/ContributionPledgedEvent.js';
import type { HoldExtendedEvent } from '../events/HoldExtendedEvent.js';
import type { HoldReleasedEvent } from '../events/HoldReleasedEvent.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import type { ItemPurchasedEvent } from '../events/ItemPurchasedEvent.js';
import { Contribution } from './Contribution.js';
import { Hold, type HoldStatus } from './Hold.js';
import { MAX_MONEY_MINOR, Money } from '../value-objects/Money.js';
import { UuidId } from '../value-objects/UuidId.js';

export type ItemType = 'single' | 'group';
export const MAX_CONTRIBUTION_TARGET_MULTIPLE = 5; // shortcut: constant, not the MAX_CONTRIBUTION_TARGET_MULTIPLE env var; add the env var when an operator needs another value
const MAX_URL_LENGTH = 2048; // the de facto browser/CDN limit; bounds stored input

export type ItemStatus = 'available' | 'held' | 'purchased';

const sumMinor = (contributions: readonly Contribution[]): number => contributions.reduce((sum, c) => sum + c.amount.amountMinor, 0);

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isHttpsUrl(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
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
    readonly type: ItemType,
    readonly title: string,
    readonly quantity: number,
    readonly url: string | null,
    readonly priceMinor: number | null,
    private _seq: number,
    private readonly asOf: Date,
    private _holds: Hold[],
    private _contributions: Contribution[],
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
    if (type !== 'single' && type !== 'group') throw new DomainValidationError('Item type must be "single" or "group"');
    if (!Number.isInteger(quantity) || quantity < 1) throw new DomainValidationError('Item quantity must be a positive integer');
    if (url !== null && !isHttpsUrl(url)) throw new DomainValidationError(`Item URL must be an https URL of at most ${MAX_URL_LENGTH} characters`);
    if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 1 || priceMinor > MAX_MONEY_MINOR)) {
      throw new DomainValidationError('Item price must be a positive whole number of minor units within the limit');
    }
    if (type === 'group' && (priceMinor === null || quantity !== 1)) throw new DomainValidationError('A group gift is one unit with a price');
    if (!isNonNegativeInteger(_seq)) throw new DomainValidationError('Item seq must be a non-negative integer');
    if ([..._holds, ..._contributions].some((member) => member.itemId.value !== id.value)) {
      throw new DomainValidationError('A hold or contribution belongs to another item');
    }
    if (sumMinor(_contributions) > MAX_MONEY_MINOR) throw new DomainValidationError('Pledges on an item total more than the limit');
  }

  static createSingle(props: {
    id: string; wishlistId: string; title: string; quantity?: number; url?: string | null; priceMinor?: number | null; asOf: Date;
  }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), 'single', props.title.trim(), props.quantity ?? 1,
      props.url ?? null, props.priceMinor ?? null, 0, new Date(props.asOf.getTime()), [], [],
    );
  }

  static createGroup(props: { id: string; wishlistId: string; title: string; priceMinor: number; url?: string | null; asOf: Date }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), 'group', props.title.trim(), 1,
      props.url ?? null, props.priceMinor, 0, new Date(props.asOf.getTime()), [], [],
    );
  }

  /**
   * Reconstructs an Item from persisted fields. `type` stays a `string` so
   * infrastructure can pass `row.type` straight through; the constructor
   * rejects anything but a known type, so the cast below weakens nothing.
   * `asOf` is the instant its aggregate was loaded at; `holds` and
   * `contributions` are this item's own.
   */
  static reconstitute(props: {
    id: string; wishlistId: string; type: string; title: string; quantity: number;
    url?: string | null; priceMinor?: number | null; seq: number;
    asOf: Date; holds?: readonly Hold[]; contributions?: readonly Contribution[];
  }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), props.type as ItemType,
      props.title, props.quantity, props.url ?? null, props.priceMinor ?? null, props.seq,
      new Date(props.asOf.getTime()), [...(props.holds ?? [])], [...(props.contributions ?? [])],
    );
  }

  /**
   * The seq this item's stream is at, from `item_state.seq`. Appends must
   * use the `expectedSeq` a command hands back for the store's optimistic check
   * (ADR-0010) to accept them.
   */
  get seq(): number {
    return this._seq;
  }

  get holds(): readonly Hold[] {
    return this._holds;
  }

  get contributions(): readonly Contribution[] {
    return this._contributions;
  }

  /** Whether this item decides at `at`: its aggregate's instant, set when it was built or loaded. */
  isLoadedAt(at: Date): boolean {
    return this.asOf.getTime() === at.getTime();
  }

  findHold(holdId: string): Hold | null {
    return this._holds.find((hold) => hold.id.value === holdId) ?? null;
  }

  findHoldWithKey(idempotencyKey: string): Hold | null {
    return this._holds.find((hold) => hold.idempotencyKey.value === idempotencyKey) ?? null;
  }

  findContributionWithKey(idempotencyKey: string): Contribution | null {
    return this._contributions.find((c) => c.idempotencyKey.value === idempotencyKey) ?? null;
  }

  /** Units bought: its holds marked purchased. Derived, never stored. */
  purchasedCount(): number {
    return this.holdsThatAre('purchased');
  }

  /** Units no one holds or has bought. Never negative: quantity may drop below what is already committed (ADR-0019). */
  availableUnits(): number {
    return Math.max(0, this.quantity - this.holdsThatAre('active') - this.purchasedCount());
  }

  status(): ItemStatus {
    if (this.availableUnits() > 0) return 'available';
    return this.purchasedCount() >= this.quantity ? 'purchased' : 'held';
  }

  /**
   * Decides whether a unit is free, mints the Hold — its id and secret
   * belong to a hold that does not exist yet, so they are not the caller's
   * to supply — and the event recording it, then advances this item's
   * stream, adding the hold to its own. It decides at the item's `asOf`.
   * Reach it through `Wishlist.holdItem`, which authorizes the caller;
   * application code never calls this directly.
   *
   * Collaborators are structural types: domain/ may not import
   * application/ (ADR-0012), and the application layer's TokenGenerator and
   * Hasher already satisfy these shapes.
   */
  placeHold(
    props: { sessionHash: string; idempotencyKey: string; durationMs: number; piiRef: string },
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): { hold: Hold; event: ItemHeldEvent; expectedSeq: number } {
    // Group gifts take pledges, never holds; the UI never offers one.
    if (this.type === 'group') throw new ItemUnavailableError(this.id.value);
    if (this.availableUnits() === 0) throw new ItemUnavailableError(this.id.value);

    const hold = Hold.create({
      id: tokens.generateEntityId(),
      itemId: this.id.value,
      secret: tokens.generateHoldSecret(),
      sessionHash: props.sessionHash,
      idempotencyKey: props.idempotencyKey,
      piiRef: props.piiRef,
      expiresAt: new Date(this.asOf.getTime() + props.durationMs),
      at: this.asOf,
    });
    const event: ItemHeldEvent = {
      type: 'ItemHeld',
      v: 1,
      itemId: hold.itemId.value,
      holdId: hold.id.value,
      secretHash: hasher.hash(hold.secret.value),
      sessionHash: hold.sessionHash.value,
      idempotencyKey: hold.idempotencyKey.value,
      piiRef: hold.piiRef?.value ?? null,
      expiresAt: hold.expiresAt.toISOString(),
      occurredAt: this.asOf.toISOString(),
    };
    this._holds.push(hold);
    return { hold, event, expectedSeq: this.recordEvent() };
  }

  /** The sum of its pledges. Derived, never stored. */
  pledgedTotal(): Money {
    return Money.usd(sumMinor(this._contributions));
  }

  /**
   * A guest's pledge toward a group gift. Overfunding is allowed up to
   * `MAX_CONTRIBUTION_TARGET_MULTIPLE` times the price per pledge (ADR-0047),
   * and the item's total stays within `MAX_MONEY_MINOR` (ADR-0061). It
   * decides at the item's `asOf` and adds the pledge to its own. Reach it
   * through `Wishlist.pledge`, which authorizes the item.
   */
  pledge(
    props: { amountMinor: number; sessionHash: string; idempotencyKey: string; piiRef: string },
    ids: { generateEntityId(): string },
  ): { contribution: Contribution; event: ContributionPledgedEvent; expectedSeq: number } {
    if (this.type !== 'group') throw new ItemUnavailableError(this.id.value);
    // A group always has a price (the constructor enforces it); `?? 0` only satisfies the type.
    const max = (this.priceMinor ?? 0) * MAX_CONTRIBUTION_TARGET_MULTIPLE;
    if (!Number.isSafeInteger(props.amountMinor) || props.amountMinor > max) {
      throw new ContributionAmountError(this.id.value);
    }
    // ADR-0061: the guard bounds the total too, so pledgedTotal() is always a valid Money.
    if (this.pledgedTotal().amountMinor + props.amountMinor > MAX_MONEY_MINOR) throw new ContributionAmountError(this.id.value);
    const contribution = Contribution.create({
      id: ids.generateEntityId(),
      itemId: this.id.value,
      amount: Money.usd(props.amountMinor),
      sessionHash: props.sessionHash,
      idempotencyKey: props.idempotencyKey,
      piiRef: props.piiRef,
      pledgedAt: this.asOf,
    });
    const event: ContributionPledgedEvent = {
      type: 'ContributionPledged',
      v: 1,
      itemId: this.id.value,
      contributionId: contribution.id.value,
      amountMinor: props.amountMinor,
      sessionHash: contribution.sessionHash.value,
      idempotencyKey: contribution.idempotencyKey.value,
      piiRef: contribution.piiRef.value,
      occurredAt: this.asOf.toISOString(),
    };
    this._contributions.push(contribution);
    return { contribution, event, expectedSeq: this.recordEvent() };
  }

  /** The state of one of its holds, at the instant it was loaded at. Throws HoldNotFoundError for a hold it did not load. */
  holdStatus(hold: Hold): HoldStatus {
    return this.ownHold(hold).statusAt(this.asOf);
  }

  /** `extendHold`'s rule as a question; false for a hold it did not load. */
  canExtendHold(hold: Hold): boolean {
    return this.findHold(hold.id.value)?.canExtendAt(this.asOf) ?? false;
  }

  /** `releaseHold`'s rule as a question; false for a hold it did not load. */
  canReleaseHold(hold: Hold): boolean {
    return this.findHold(hold.id.value)?.canReleaseAt(this.asOf) ?? false;
  }

  /** `purchaseHold`'s rule as a question, for views that offer the action only when it would succeed; false for a hold it did not load. */
  canPurchaseHold(hold: Hold): boolean {
    const own = this.findHold(hold.id.value);
    return own !== null && this.purchaseRefusal(own) === null;
  }

  // Each hold command acts on the item's own instance of `hold`, at the item's `asOf`, and advances its stream.

  /** Reach it through `Wishlist.extendHold`, which authorizes the hold. */
  extendHold(hold: Hold, durationMs: number): { hold: Hold; event: HoldExtendedEvent; expectedSeq: number } {
    const own = this.ownHold(hold);
    const event = own.extend(this.asOf, durationMs);
    return { hold: own, event, expectedSeq: this.recordEvent() };
  }

  /** Reach it through `Wishlist.releaseHold`, which authorizes the hold. */
  releaseHold(hold: Hold): { hold: Hold; event: HoldReleasedEvent; expectedSeq: number } {
    const own = this.ownHold(hold);
    const event = own.release(this.asOf);
    return { hold: own, event, expectedSeq: this.recordEvent() };
  }

  /**
   * An active hold may always be purchased — its unit is already its own.
   * An expired one may be too, so a guest who bought the gift after their
   * hold lapsed need not re-hold it — but only while a unit is still
   * free, or they would be buying one someone else now holds. Reach it
   * through `Wishlist.purchaseHold`, which authorizes the hold.
   */
  purchaseHold(hold: Hold): { hold: Hold; event: ItemPurchasedEvent; expectedSeq: number } {
    const own = this.ownHold(hold);
    const refusal = this.purchaseRefusal(own);
    if (refusal === 'closed') throw new HoldNotActiveError(own.id.value);
    if (refusal === 'lapsed') throw new HoldLapsedError(this.id.value);
    const event = own.markPurchased(this.asOf);
    return { hold: own, event, expectedSeq: this.recordEvent() };
  }

  /** Why `purchaseHold` would refuse `hold`, or null when it would succeed. Takes the item's own instance. */
  private purchaseRefusal(hold: Hold): 'closed' | 'lapsed' | null {
    const status = hold.statusAt(this.asOf);
    if (status === 'active') return null;
    if (status !== 'expired') return 'closed';
    return this.availableUnits() === 0 ? 'lapsed' : null;
  }

  /** Its own instance of `hold`; HoldNotFoundError when it did not load it. */
  private ownHold(hold: Hold): Hold {
    const own = this.findHold(hold.id.value);
    if (!own) throw new HoldNotFoundError(hold.id.value);
    return own;
  }

  /**
   * Advances the stream by one event and returns the seq it was at — the
   * value to append against. Every command on a hold of this item records
   * through here, since they all share the item's stream (ADR-0008).
   */
  private recordEvent(): number {
    const expectedSeq = this._seq;
    this._seq += 1;
    return expectedSeq;
  }

  /** Re-checked at `asOf` rather than trusted from the load: only `statusAt` defines a hold's state. */
  private holdsThatAre(status: 'active' | 'purchased'): number {
    return this._holds.filter((hold) => hold.statusAt(this.asOf) === status).length;
  }
}
