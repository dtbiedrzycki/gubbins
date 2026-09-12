import { DomainValidationError } from '../errors.js';

export class Hold {
  private constructor(
    readonly id: string,
    readonly itemId: string,
    readonly secret: string,
    readonly sessionHash: string,
    readonly idempotencyKey: string,
    readonly expiresAt: Date,
  ) {}

  static create(props: {
    id: string; itemId: string; secret: string; sessionHash: string;
    idempotencyKey: string; expiresAt: Date; now: Date;
  }): Hold {
    if (props.secret.length === 0) throw new DomainValidationError('Hold secret must not be empty');
    if (props.expiresAt.getTime() <= props.now.getTime()) {
      throw new DomainValidationError('Hold expiresAt must be in the future');
    }
    return new Hold(props.id, props.itemId, props.secret, props.sessionHash, props.idempotencyKey, props.expiresAt);
  }
}
