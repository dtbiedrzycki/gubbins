import { describe, expect, it } from 'vitest';
import { Hold } from './Hold.js';
import { DomainValidationError } from '../errors.js';

describe('Hold.create', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const validProps = {
    id: '55555555-5555-7555-8555-555555555555', itemId: '33333333-3333-7333-8333-333333333333',
    secret: 'hold-secret', sessionHash: 'a'.repeat(64),
    idempotencyKey: 'idem-1', expiresAt: new Date('2026-01-04T00:00:00Z'), now,
  };

  it('creates a hold', () => {
    const hold = Hold.create(validProps);
    expect(hold.id.value).toBe(validProps.id);
    expect(hold.expiresAt).toEqual(validProps.expiresAt);
  });

  it('wraps the secret in a value object', () => {
    expect(Hold.create(validProps).secret.value).toBe('hold-secret');
  });

  it('wraps the session hash in a value object', () => {
    expect(Hold.create(validProps).sessionHash.value).toBe(validProps.sessionHash);
  });

  it('wraps the idempotency key in a value object', () => {
    expect(Hold.create(validProps).idempotencyKey.value).toBe('idem-1');
  });

  it('rejects an empty secret', () => {
    expect(() => Hold.create({ ...validProps, secret: '' })).toThrow(DomainValidationError);
  });

  it('rejects a session hash that is not 64 hex characters', () => {
    expect(() => Hold.create({ ...validProps, sessionHash: 'not-a-hash' })).toThrow(DomainValidationError);
  });

  it('rejects an empty idempotency key', () => {
    expect(() => Hold.create({ ...validProps, idempotencyKey: '' })).toThrow(DomainValidationError);
  });

  it('rejects an expiresAt that is not in the future relative to now', () => {
    expect(() => Hold.create({ ...validProps, expiresAt: now })).toThrow(DomainValidationError);
  });

  it('rejects an id that is not a valid UUID', () => {
    expect(() => Hold.create({ ...validProps, id: 'h1' })).toThrow(DomainValidationError);
  });
});
