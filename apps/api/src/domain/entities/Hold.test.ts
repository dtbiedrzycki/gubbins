import { describe, expect, it } from 'vitest';
import { Hold } from './Hold.js';
import { DomainValidationError, HoldAlreadyExtendedError, HoldNotActiveError } from '../errors.js';

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

describe('Hold.statusAt — the one definition of hold state', () => {
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
    const at = new Date('2026-01-01T00:00:00.000Z');
    const hold = Hold.create({
      id: HOLD_ID, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: 'a'.repeat(64),
      idempotencyKey: 'idem-1', expiresAt: EXPIRES_AT, now: at,
    });
    expect(hold.statusAt(at)).toBe('active');
    expect([hold.extendedAt, hold.releasedAt, hold.purchasedAt]).toEqual([null, null, null]);
  });
});

const DAY = 86_400_000;
const CREATED = new Date(EXPIRES_AT.getTime() - 3 * DAY);

describe('Hold.extend', () => {
  it('adds the duration to the current expiresAt — not to the instant of the call — and stamps extendedAt', () => {
    const hold = persisted();
    const at = new Date(CREATED.getTime() + DAY);

    hold.extend(at, 3 * DAY);

    expect(hold.expiresAt).toEqual(new Date(EXPIRES_AT.getTime() + 3 * DAY));
    expect(hold.extendedAt).toEqual(at);
  });

  it('returns HoldExtended carrying the new expiry', () => {
    const at = new Date(CREATED.getTime() + DAY);
    expect(persisted().extend(at, 3 * DAY)).toEqual({
      type: 'HoldExtended', v: 1, holdId: HOLD_ID,
      expiresAt: new Date(EXPIRES_AT.getTime() + 3 * DAY).toISOString(), occurredAt: at.toISOString(),
    });
  });

  it('allows the extension at the very instant the hold expires', () => {
    expect(() => persisted().extend(EXPIRES_AT, DAY)).not.toThrow();
  });

  it('refuses a second extension and leaves the hold as it was', () => {
    const hold = persisted();
    hold.extend(CREATED, DAY);
    const expiresAfterFirst = hold.expiresAt;

    expect(() => hold.extend(CREATED, DAY)).toThrow(HoldAlreadyExtendedError);
    expect(hold.expiresAt).toEqual(expiresAfterFirst);
  });

  it.each([
    ['expired', persisted, msFromExpiry(1)],
    ['released', () => persisted({ releasedAt: CREATED }), CREATED],
    ['purchased', () => persisted({ purchasedAt: CREATED }), CREATED],
  ] as const)('refuses a %s hold', (_state, make, at) => {
    expect(() => make().extend(at, DAY)).toThrow(HoldNotActiveError);
  });

  it('refuses a duration that is not a positive whole number of milliseconds', () => {
    expect(() => persisted().extend(CREATED, 0)).toThrow(DomainValidationError);
    expect(() => persisted().extend(CREATED, 1.5)).toThrow(DomainValidationError);
  });
});

describe('Hold.release', () => {
  it('stamps releasedAt and returns HoldReleased', () => {
    const hold = persisted();
    expect(hold.release(CREATED)).toEqual({ type: 'HoldReleased', v: 1, holdId: HOLD_ID, occurredAt: CREATED.toISOString() });
    expect(hold.statusAt(CREATED)).toBe('released');
  });

  it.each([
    ['expired', persisted, msFromExpiry(1)],
    ['released', () => persisted({ releasedAt: CREATED }), CREATED],
    ['purchased', () => persisted({ purchasedAt: CREATED }), CREATED],
  ] as const)('refuses a %s hold', (_state, make, at) => {
    expect(() => make().release(at)).toThrow(HoldNotActiveError);
  });
});

describe('Hold.markPurchased', () => {
  it('stamps purchasedAt and returns ItemPurchased', () => {
    const hold = persisted();
    expect(hold.markPurchased(CREATED)).toEqual({ type: 'ItemPurchased', v: 1, holdId: HOLD_ID, occurredAt: CREATED.toISOString() });
    expect(hold.statusAt(CREATED)).toBe('purchased');
  });

  it('accepts an expired hold — whether a unit is still free is the wishlist\'s call', () => {
    expect(() => persisted().markPurchased(msFromExpiry(1))).not.toThrow();
  });

  it.each([
    ['released', () => persisted({ releasedAt: CREATED })],
    ['purchased', () => persisted({ purchasedAt: CREATED })],
  ] as const)('refuses a %s hold — both are terminal', (_state, make) => {
    expect(() => make().markPurchased(CREATED)).toThrow(HoldNotActiveError);
  });
});

describe('Hold predicates', () => {
  it('belongsToSession compares the stored session hash', () => {
    expect(persisted().belongsToSession('a'.repeat(64))).toBe(true);
    expect(persisted().belongsToSession('b'.repeat(64))).toBe(false);
  });

  it('canExtendAt: active and never extended', () => {
    expect(persisted().canExtendAt(CREATED)).toBe(true);
    expect(persisted({ extendedAt: CREATED }).canExtendAt(CREATED)).toBe(false);
    expect(persisted().canExtendAt(msFromExpiry(1))).toBe(false);
  });

  it('canReleaseAt: active, extended or not', () => {
    expect(persisted({ extendedAt: CREATED }).canReleaseAt(CREATED)).toBe(true);
    expect(persisted({ purchasedAt: CREATED }).canReleaseAt(CREATED)).toBe(false);
    expect(persisted().canReleaseAt(msFromExpiry(1))).toBe(false);
  });
});
