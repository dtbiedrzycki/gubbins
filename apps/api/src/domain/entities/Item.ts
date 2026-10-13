import { DomainValidationError, ItemUnavailableError } from '../errors.js';
import type { ItemHeldEvent } from '../events/ItemHeldEvent.js';
import { Hold } from './Hold.js';
import { UuidId } from '../value-objects/UuidId.js';

export type ItemType = 'single' | 'group';
export const MAX_MONEY_MINOR = 10 ** 12;
const MAX_URL_LENGTH = 2048;

export type ItemStatus = 'available' | 'held' | 'purchased';

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
  ) {
    if (title.trim().length === 0) throw new DomainValidationError('Item title must not be empty');
    if (title.length > 120) throw new DomainValidationError('Item title must be at most 120 characters');
    if (type !== 'single' && type !== 'group') throw new DomainValidationError('Item type must be "single" or "group"');
    if (!Number.isInteger(quantity) || quantity < 1) throw new DomainValidationError('Item quantity must be a positive integer');
    if (url !== null && !isHttpsUrl(url)) throw new DomainValidationError('Item URL must be an https URL of at most 2048 characters');
    if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 1 || priceMinor > MAX_MONEY_MINOR)) {
      throw new DomainValidationError('Item price must be a positive whole number of minor units within the limit');
    }
    if (type === 'group' && (priceMinor === null || quantity !== 1)) throw new DomainValidationError('A group gift is one unit with a price');
    if (!isNonNegativeInteger(_seq)) throw new DomainValidationError('Item seq must be a non-negative integer');
  }

  static createSingle(props: {
    id: string; wishlistId: string; title: string; quantity?: number; url?: string | null; priceMinor?: number | null;
  }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), 'single', props.title.trim(), props.quantity ?? 1,
      props.url ?? null, props.priceMinor ?? null, 0,
    );
  }

  static createGroup(props: { id: string; wishlistId: string; title: string; priceMinor: number; url?: string | null }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), 'group', props.title.trim(), 1,
      props.url ?? null, props.priceMinor, 0,
    );
  }

  /**
   * Reconstructs an Item from persisted fields. `type` stays a `string` so
   * infrastructure can pass `row.type` straight through; the constructor
   * rejects anything but a known type, so the cast below weakens nothing.
   */
  static reconstitute(props: {
    id: string; wishlistId: string; type: string; title: string; quantity: number;
    url?: string | null; priceMinor?: number | null; seq: number;
  }): Item {
    return new Item(
      UuidId.from(props.id), UuidId.from(props.wishlistId), props.type as ItemType,
      props.title, props.quantity, props.url ?? null, props.priceMinor ?? null, props.seq,
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

  /**
   * Units no one holds or has bought, given how many holds on this item are
   * active at the wishlist's instant and how many have been purchased. Both
   * counts come from the caller — the Wishlist, which carries the list's
   * holds — because they are facts about hold rows, never counters kept
   * here. Never negative: quantity may drop below what is already committed
   * (ADR-0019).
   */
  availableUnits(activeHolds: number, purchasedCount: number): number {
    return Math.max(0, this.quantity - activeHolds - purchasedCount);
  }

  statusGiven(activeHolds: number, purchasedCount: number): ItemStatus {
    if (this.availableUnits(activeHolds, purchasedCount) > 0) return 'available';
    return purchasedCount >= this.quantity ? 'purchased' : 'held';
  }

  /**
   * Decides whether a unit is free, mints the Hold — its id and secret
   * belong to a hold that does not exist yet, so they are not the caller's
   * to supply — and the event recording it, then advances this item's
   * stream. Reach it through `Wishlist.holdItem`, which supplies
   * both hold counts, authorizes the caller and passes as `at` the instant it
   * was loaded at; application code never calls this directly.
   *
   * Collaborators are structural types: domain/ may not import
   * application/ (ADR-0012), and the application layer's TokenGenerator and
   * Hasher already satisfy these shapes.
   */
  placeHold(
    props: { sessionHash: string; idempotencyKey: string; at: Date; durationMs: number; piiRef?: string },
    activeHolds: number,
    purchasedCount: number,
    tokens: { generateEntityId(): string; generateHoldSecret(): string },
    hasher: { hash(value: string): string },
  ): { hold: Hold; event: ItemHeldEvent; expectedSeq: number } {
    // Group gifts take pledges, never holds; the UI never offers one.
    if (this.type === 'group') throw new ItemUnavailableError(this.id.value);
    if (this.availableUnits(activeHolds, purchasedCount) === 0) throw new ItemUnavailableError(this.id.value);

    const hold = Hold.create({
      id: tokens.generateEntityId(),
      itemId: this.id.value,
      secret: tokens.generateHoldSecret(),
      sessionHash: props.sessionHash,
      idempotencyKey: props.idempotencyKey,
      piiRef: props.piiRef ?? null,
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
      piiRef: hold.piiRef?.value ?? null,
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
}
