import { DomainValidationError } from '../errors.js';

/**
 * The client-generated key (ADR-048) that lets a replayed hold submit
 * return its original result instead of creating a second hold. Opaque and
 * client-chosen (the web client uses crypto.randomUUID()) — bounded only
 * to reject pathological input at the domain boundary, same rationale as
 * Slug.
 */
export class IdempotencyKey {
  private readonly _brand = 'IdempotencyKey' as const;

  private constructor(readonly value: string) {}

  static from(value: string): IdempotencyKey {
    if (value.length === 0) throw new DomainValidationError('Idempotency key must not be empty');
    if (value.length > 200) throw new DomainValidationError('Idempotency key must be at most 200 characters');
    return new IdempotencyKey(value);
  }
}
