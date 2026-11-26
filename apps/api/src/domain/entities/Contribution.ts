import { DomainValidationError } from '../errors.js';
import { IdempotencyKey } from '../value-objects/IdempotencyKey.js';
import { Money } from '../value-objects/Money.js';
import { SessionHash } from '../value-objects/SessionHash.js';
import { UuidId } from '../value-objects/UuidId.js';

/** A guest's pledge toward a group gift: an entity inside the Wishlist aggregate, under its Item (ADR-0078). */
export class Contribution {
  private constructor(
    readonly id: UuidId,
    readonly itemId: UuidId,
    readonly amount: Money,
    readonly sessionHash: SessionHash,
    readonly idempotencyKey: IdempotencyKey,
    readonly guestPiiRef: UuidId,
    readonly pledgedAt: Date,
    /** The owner_pii row of the handle the guest paid (ADR-0090); null for a pledge made before this, or sent without a method. */
    readonly ownerPiiRef: UuidId | null,
  ) {
    // Money allows zero, for totals; a pledge of nothing is not a pledge.
    if (amount.amountMinor === 0) throw new DomainValidationError('A pledge must be more than zero');
  }

  static create(props: {
    id: string; itemId: string; amount: Money; sessionHash: string; idempotencyKey: string; guestPiiRef: string; pledgedAt: Date;
    ownerPiiRef?: string | null;
  }): Contribution {
    return new Contribution(
      UuidId.from(props.id), UuidId.from(props.itemId), props.amount, SessionHash.from(props.sessionHash),
      IdempotencyKey.from(props.idempotencyKey), UuidId.from(props.guestPiiRef), props.pledgedAt,
      props.ownerPiiRef == null ? null : UuidId.from(props.ownerPiiRef),
    );
  }

  static reconstitute(props: {
    id: string; itemId: string; amountMinor: number; sessionHash: string; idempotencyKey: string; guestPiiRef: string; pledgedAt: Date;
    ownerPiiRef?: string | null;
  }): Contribution {
    return Contribution.create({ ...props, amount: Money.usd(props.amountMinor) });
  }

  belongsToSession(sessionHash: string): boolean {
    return this.sessionHash.value === sessionHash;
  }
}
