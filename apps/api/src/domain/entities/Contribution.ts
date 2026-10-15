import { DomainValidationError } from '../errors.js';
import { IdempotencyKey } from '../value-objects/IdempotencyKey.js';
import { Money } from '../value-objects/Money.js';
import { SessionHash } from '../value-objects/SessionHash.js';
import { UuidId } from '../value-objects/UuidId.js';

/** A guest's pledge toward a group gift. Its own aggregate, referenced by itemId. */
export class Contribution {
  private constructor(
    readonly id: UuidId,
    readonly itemId: UuidId,
    readonly amount: Money,
    readonly sessionHash: SessionHash,
    readonly idempotencyKey: IdempotencyKey,
    readonly piiRef: UuidId,
    readonly pledgedAt: Date,
  ) {
    // Money allows zero, for totals; a pledge of nothing is not a pledge.
    if (amount.amountMinor === 0) throw new DomainValidationError('A pledge must be more than zero');
  }

  static create(props: {
    id: string; itemId: string; amount: Money; sessionHash: string; idempotencyKey: string; piiRef: string; pledgedAt: Date;
  }): Contribution {
    return new Contribution(
      UuidId.from(props.id), UuidId.from(props.itemId), props.amount, SessionHash.from(props.sessionHash),
      IdempotencyKey.from(props.idempotencyKey), UuidId.from(props.piiRef), props.pledgedAt,
    );
  }

  static reconstitute(props: {
    id: string; itemId: string; amountMinor: number; sessionHash: string; idempotencyKey: string; piiRef: string; pledgedAt: Date;
  }): Contribution {
    return Contribution.create({ ...props, amount: Money.usd(props.amountMinor) });
  }

  belongsToSession(sessionHash: string): boolean {
    return this.sessionHash.value === sessionHash;
  }
}
