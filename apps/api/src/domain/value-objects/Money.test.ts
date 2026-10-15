import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { Money } from './Money.js';

describe('Money.usd', () => {
  it.each([-1, 1.5, 10 ** 12 + 1, Number.NaN])('refuses %j', (v) => {
    expect(() => Money.usd(v)).toThrow(DomainValidationError);
  });
  it.each([0, 2500, 10 ** 12])('accepts %j', (v) => {
    expect(Money.usd(v).amountMinor).toBe(v);
  });
});
