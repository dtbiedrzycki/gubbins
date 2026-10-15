import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { Contribution } from './Contribution.js';

const row = {
  id: '44444444-4444-7444-8444-444444444444', itemId: '33333333-3333-7333-8333-333333333333', sessionHash: 'a'.repeat(64),
  idempotencyKey: 'k1', piiRef: '55555555-5555-7555-8555-555555555555', pledgedAt: new Date('2026-10-13T10:00:00Z'),
};

describe('Contribution', () => {
  it('refuses a pledge of zero, even from a stored row', () => {
    expect(() => Contribution.reconstitute({ ...row, amountMinor: 0 })).toThrow(DomainValidationError);
  });
  it('keeps a pledge of one cent', () => {
    expect(Contribution.reconstitute({ ...row, amountMinor: 1 }).amount.amountMinor).toBe(1);
  });
});
