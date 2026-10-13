import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { Money } from './Money.js';

describe('Money.usd', () => {
  it.each([0, -1, 1.5, 10 ** 12 + 1, Number.NaN])('refuses %j', (v) => {
    expect(() => Money.usd(v)).toThrow(DomainValidationError);
  });
  it('keeps a valid amount', () => {
    expect(Money.usd(2500).amountMinor).toBe(2500);
  });
});
