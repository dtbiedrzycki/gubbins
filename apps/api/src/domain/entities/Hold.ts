import { DomainValidationError } from '../errors.js';
import { HoldSecret } from '../value-objects/HoldSecret.js';
import { IdempotencyKey } from '../value-objects/IdempotencyKey.js';
import { SessionHash } from '../value-objects/SessionHash.js';
import { UuidId } from '../value-objects/UuidId.js';

/**
 * A hold's state at some instant. Never stored: `statusAt` derives it from
 * the timestamps, so nothing has to be written when a hold expires
 * (holds-lifecycle D4, D5; ADR-0002's lazy expiry).
 */
export type HoldStatus = 'active' | 'expired' | 'released' | 'purchased';

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
    idempotencyKey: string; expiresAt: Date; now: Date;
  }): Hold {
    const secret = HoldSecret.from(props.secret);
    const sessionHash = SessionHash.from(props.sessionHash);
    const idempotencyKey = IdempotencyKey.from(props.idempotencyKey);
    if (props.expiresAt.getTime() <= props.now.getTime()) {
      throw new DomainValidationError('Hold expiresAt must be in the future');
    }
    return new Hold(
      UuidId.from(props.id), UuidId.from(props.itemId), secret, sessionHash, idempotencyKey,
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
  }): Hold {
    return new Hold(
      UuidId.from(props.id), UuidId.from(props.itemId), HoldSecret.from(props.secret),
      SessionHash.from(props.sessionHash), IdempotencyKey.from(props.idempotencyKey),
      props.expiresAt, props.extendedAt, props.releasedAt, props.purchasedAt,
    );
  }

  get expiresAt(): Date { return this._expiresAt; }
  get extendedAt(): Date | null { return this._extendedAt; }
  get releasedAt(): Date | null { return this._releasedAt; }
  get purchasedAt(): Date | null { return this._purchasedAt; }

  /**
   * The one definition of hold state (holds-lifecycle §1). Strictly after:
   * at the very instant `now === expiresAt` the hold is still active, as the
   * holds spec's `now > expiresAt` says.
   */
  statusAt(now: Date): HoldStatus {
    if (this._purchasedAt !== null) return 'purchased';
    if (this._releasedAt !== null) return 'released';
    if (now.getTime() > this._expiresAt.getTime()) return 'expired';
    return 'active';
  }
}
