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

const HOLD_ID = '55555555-5555-7555-8555-555555555555';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const EXPIRES_AT = new Date('2026-01-04T00:00:00.000Z');
const msFromExpiry = (ms: number) => new Date(EXPIRES_AT.getTime() + ms);

function persisted(overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}) {
  return Hold.reconstitute({
    id: HOLD_ID, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1',
    expiresAt: EXPIRES_AT, extendedAt: null, releasedAt: null, purchasedAt: null, ...overrides,
  });
}

describe('Hold.reconstitute', () => {
  it('accepts an expiresAt in the past — a stored hold may well have expired since', () => {
    expect(persisted({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }).expiresAt).toEqual(new Date('2020-01-01T00:00:00.000Z'));
  });

  it('restores the lifecycle timestamps', () => {
    const extendedAt = msFromExpiry(-86_400_000);
    const releasedAt = msFromExpiry(-1_000);
    const hold = persisted({ extendedAt, releasedAt });
    expect(hold.extendedAt).toEqual(extendedAt);
    expect(hold.releasedAt).toEqual(releasedAt);
    expect(hold.purchasedAt).toBeNull();
  });

  it('refuses a hold that is both released and purchased', () => {
    expect(() => persisted({ releasedAt: EXPIRES_AT, purchasedAt: EXPIRES_AT })).toThrow(DomainValidationError);
  });

  it('enforces the value-object invariants on persisted rows too', () => {
    expect(() => persisted({ sessionHash: 'nope' })).toThrow(DomainValidationError);
  });
});

describe('Hold.statusAt — the one definition of hold state (D5)', () => {
  it.each([
    ['1 ms before expiresAt', -1, 'active'],
    ['at expiresAt exactly', 0, 'active'],
    ['1 ms after expiresAt', 1, 'expired'],
  ] as const)('%s, an open hold is %s', (_when, offset, status) => {
    expect(persisted().statusAt(msFromExpiry(offset))).toBe(status);
  });

  it('is released once releasedAt is set, before or after expiry', () => {
    const hold = persisted({ releasedAt: msFromExpiry(-10) });
    expect(hold.statusAt(msFromExpiry(-1))).toBe('released');
    expect(hold.statusAt(msFromExpiry(1))).toBe('released');
  });

  it('is purchased once purchasedAt is set, even long after expiry', () => {
    expect(persisted({ purchasedAt: msFromExpiry(5) }).statusAt(msFromExpiry(86_400_000))).toBe('purchased');
  });

  it('starts a newly created hold active, with no lifecycle timestamps', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const hold = Hold.create({
      id: HOLD_ID, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: 'a'.repeat(64),
      idempotencyKey: 'idem-1', expiresAt: EXPIRES_AT, now,
    });
    expect(hold.statusAt(now)).toBe('active');
    expect([hold.extendedAt, hold.releasedAt, hold.purchasedAt]).toEqual([null, null, null]);
  });
});
