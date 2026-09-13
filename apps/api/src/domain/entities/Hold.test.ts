import { describe, expect, it } from 'vitest';
import { Hold } from './Hold.js';
import { DomainValidationError } from '../errors.js';

describe('Hold.create', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const validProps = {
    id: 'h1', itemId: 'i1', secret: 'hold-secret', sessionHash: 'session-hash',
    idempotencyKey: 'idem-1', expiresAt: new Date('2026-01-04T00:00:00Z'), now,
  };

  it('creates a hold', () => {
    const hold = Hold.create(validProps);
    expect(hold.id).toBe('h1');
    expect(hold.expiresAt).toEqual(validProps.expiresAt);
  });

  it('wraps the secret in a value object', () => {
    expect(Hold.create(validProps).secret.value).toBe('hold-secret');
  });

  it('rejects an empty secret', () => {
    expect(() => Hold.create({ ...validProps, secret: '' })).toThrow(DomainValidationError);
  });

  it('rejects an expiresAt that is not in the future relative to now', () => {
    expect(() => Hold.create({ ...validProps, expiresAt: now })).toThrow(DomainValidationError);
  });
});
