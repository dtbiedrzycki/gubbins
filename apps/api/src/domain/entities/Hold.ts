import { DomainValidationError, HoldAlreadyExtendedError, HoldNotActiveError } from '../errors.js';
import type { HoldExtendedEvent } from '../events/HoldExtendedEvent.js';
import type { HoldReleasedEvent } from '../events/HoldReleasedEvent.js';
import type { ItemPurchasedEvent } from '../events/ItemPurchasedEvent.js';
import { HoldSecret } from '../value-objects/HoldSecret.js';
import { IdempotencyKey } from '../value-objects/IdempotencyKey.js';
import { SessionHash } from '../value-objects/SessionHash.js';
import { UuidId } from '../value-objects/UuidId.js';

/**
 * A hold's state at some instant. Never stored: `statusAt` derives it from
 * the timestamps, so nothing has to be written when a hold expires
 * (ADR-0002's lazy expiry).
 */
export type HoldStatus = 'active' | 'expired' | 'released' | 'purchased';

/**
 * A hold's own lifecycle rules. The methods that take an instant (`statusAt`,
 * `canExtendAt`, `canReleaseAt`, `extend`, `release`, `markPurchased`) are the
 * aggregate's internals: `Wishlist` calls them with the instant it was loaded
 * at, and application code goes through `Wishlist`, never these. That keeps
 * every decision on one instant, so no caller can decide on current data
 * using an older date.
 */
export class Hold {
  /**
   * Enforces the one invariant between the timestamps, so neither factory
   * can produce a hold that ended two ways. The lifecycle fields are private
   * and mutable because the hold's own commands (extend, release,
   * markPurchased) change them in place — sound only because every
   * aggregate is loaded fresh per unit of work, as `Item.placeHold` already
   * assumes.
   */
  private constructor(
    readonly id: UuidId,
    readonly itemId: UuidId,
    readonly secret: HoldSecret,
    readonly sessionHash: SessionHash,
    readonly idempotencyKey: IdempotencyKey,
    readonly piiRef: UuidId | null,
    private _expiresAt: Date,
    private _extendedAt: Date | null,
    private _releasedAt: Date | null,
    private _purchasedAt: Date | null,
  ) {
    if (_releasedAt !== null && _purchasedAt !== null) {
      throw new DomainValidationError('A hold cannot be both released and purchased');
    }
  }

  static create(props: {
    id: string; itemId: string; secret: string; sessionHash: string;
    idempotencyKey: string; expiresAt: Date; at: Date; piiRef?: string | null;
  }): Hold {
    const secret = HoldSecret.from(props.secret);
    const sessionHash = SessionHash.from(props.sessionHash);
    const idempotencyKey = IdempotencyKey.from(props.idempotencyKey);
    if (props.expiresAt.getTime() <= props.at.getTime()) {
      throw new DomainValidationError('Hold expiresAt must be in the future');
    }
    return new Hold(
      UuidId.from(props.id), UuidId.from(props.itemId), secret, sessionHash, idempotencyKey,
      props.piiRef == null ? null : UuidId.from(props.piiRef),
      props.expiresAt, null, null, null,
    );
  }

  /**
   * Reconstructs a Hold from persisted fields. Unlike `create`, an
   * `expiresAt` in the past is fine: a stored hold may well have expired
   * since, and expiry is computed, not recorded.
   */
  static reconstitute(props: {
    id: string; itemId: string; secret: string; sessionHash: string; idempotencyKey: string;
    expiresAt: Date; extendedAt: Date | null; releasedAt: Date | null; purchasedAt: Date | null;
    piiRef?: string | null;
  }): Hold {
    return new Hold(
      UuidId.from(props.id), UuidId.from(props.itemId), HoldSecret.from(props.secret),
      SessionHash.from(props.sessionHash), IdempotencyKey.from(props.idempotencyKey),
      props.piiRef == null ? null : UuidId.from(props.piiRef),
      props.expiresAt, props.extendedAt, props.releasedAt, props.purchasedAt,
    );
  }

  get expiresAt(): Date { return this._expiresAt; }
  get extendedAt(): Date | null { return this._extendedAt; }
  get releasedAt(): Date | null { return this._releasedAt; }
  get purchasedAt(): Date | null { return this._purchasedAt; }

  /**
   * The one definition of hold state. Strictly after: at the very instant
   * `at === expiresAt` the hold is still active. Called by `Wishlist` (see
   * the class note).
   */
  statusAt(at: Date): HoldStatus {
    if (this._purchasedAt !== null) return 'purchased';
    if (this._releasedAt !== null) return 'released';
    if (at.getTime() > this._expiresAt.getTime()) return 'expired';
    return 'active';
  }

  /**
   * A plain comparison: both sides are SHA-256 digests of a session id, not
   * the secret itself, so timing here can at most reveal a digest prefix
   * (contrast ADR-0035's constant-time rule for the secrets themselves).
   */
  belongsToSession(sessionHash: string): boolean {
    return this.sessionHash.value === sessionHash;
  }

  /** Called by `Wishlist` with its load instant, like `statusAt`. */
  canExtendAt(at: Date): boolean {
    return this.statusAt(at) === 'active' && this._extendedAt === null;
  }

  /** Called by `Wishlist` with its load instant, like `statusAt`. */
  canReleaseAt(at: Date): boolean {
    return this.statusAt(at) === 'active';
  }

  /**
   * The one self-service extension (ADR-0002): only while active, only
   * once. Adds `durationMs` to the *current* expiry rather than to `at`,
   * so the most a hold can ever last is twice the configured duration.
   * Called by `Wishlist` with its load instant.
   */
  extend(at: Date, durationMs: number): HoldExtendedEvent {
    if (!Number.isInteger(durationMs) || durationMs <= 0) {
      throw new DomainValidationError('Hold extension must be a positive whole number of milliseconds');
    }
    if (this.statusAt(at) !== 'active') throw new HoldNotActiveError(this.id.value);
    if (this._extendedAt !== null) throw new HoldAlreadyExtendedError(this.id.value);
    this._extendedAt = at;
    this._expiresAt = new Date(this._expiresAt.getTime() + durationMs);
    return { type: 'HoldExtended', v: 1, holdId: this.id.value, expiresAt: this._expiresAt.toISOString(), occurredAt: at.toISOString() };
  }

  /** Called by `Wishlist` with its load instant, like `statusAt`. */
  release(at: Date): HoldReleasedEvent {
    if (this.statusAt(at) !== 'active') throw new HoldNotActiveError(this.id.value);
    this._releasedAt = at;
    return { type: 'HoldReleased', v: 1, holdId: this.id.value, occurredAt: at.toISOString() };
  }

  /**
   * Ends the hold in a purchase. Refuses only the terminal states: an
   * expired hold may still be purchased when its item has a free unit, and
   * only the wishlist — which sees the other holds — can tell, so reach this
   * through `Wishlist.purchaseHold`, which passes its load instant.
   */
  markPurchased(at: Date): ItemPurchasedEvent {
    if (this._purchasedAt !== null || this._releasedAt !== null) throw new HoldNotActiveError(this.id.value);
    this._purchasedAt = at;
    return { type: 'ItemPurchased', v: 1, holdId: this.id.value, occurredAt: at.toISOString() };
  }
}
