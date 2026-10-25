import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { Money } from './Money.js';

describe('Money.usd', () => {
  it.each([
    ['a negative amount', -1],
    ['a fractional amount', 1.5],
    ['more than 10¹²', 10 ** 12 + 1],
    ['NaN', Number.NaN],
  ])('refuses %s', (_, v) => {
    expect(() => Money.usd(v)).toThrow(DomainValidationError);
  });
  it('accepts zero, 2500 and 10¹²', () => {
    for (const v of [0, 2500, 10 ** 12]) expect(Money.usd(v).amountMinor).toBe(v);
  });
});
