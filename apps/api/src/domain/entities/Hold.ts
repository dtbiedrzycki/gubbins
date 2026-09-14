import { DomainValidationError } from '../errors.js';
import { HoldId } from '../value-objects/HoldId.js';
import { HoldSecret } from '../value-objects/HoldSecret.js';
import { IdempotencyKey } from '../value-objects/IdempotencyKey.js';
import { ItemId } from '../value-objects/ItemId.js';
import { SessionHash } from '../value-objects/SessionHash.js';

export class Hold {
  private constructor(
    readonly id: HoldId,
    readonly itemId: ItemId,
    readonly secret: HoldSecret,
    readonly sessionHash: SessionHash,
    readonly idempotencyKey: IdempotencyKey,
    readonly expiresAt: Date,
  ) {}

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
      HoldId.from(props.id),
      ItemId.from(props.itemId),
      secret,
      sessionHash,
      idempotencyKey,
      props.expiresAt,
    );
  }
}
