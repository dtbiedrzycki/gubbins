import { DomainValidationError } from '../errors.js';
import { HoldSecret } from '../value-objects/HoldSecret.js';

export class Hold {
  private constructor(
    readonly id: string,
    readonly itemId: string,
    readonly secret: HoldSecret,
    readonly sessionHash: string,
    readonly idempotencyKey: string,
    readonly expiresAt: Date,
  ) {}

  static create(props: {
    id: string; itemId: string; secret: string; sessionHash: string;
    idempotencyKey: string; expiresAt: Date; now: Date;
  }): Hold {
    const secret = HoldSecret.from(props.secret);
    if (props.expiresAt.getTime() <= props.now.getTime()) {
      throw new DomainValidationError('Hold expiresAt must be in the future');
    }
    return new Hold(props.id, props.itemId, secret, props.sessionHash, props.idempotencyKey, props.expiresAt);
  }
}
