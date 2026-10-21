import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { Money } from './Money.js';

describe('Money.usd', () => {
  it.each([
    ['zero', 0],
    ['a negative amount', -1],
    ['a fractional amount', 1.5],
    ['more than the limit', 10 ** 12 + 1],
    ['NaN', Number.NaN],
  ])('refuses %s', (_, v) => {
    expect(() => Money.usd(v)).toThrow(DomainValidationError);
  });
  it('keeps a valid amount', () => {
    expect(Money.usd(2500).amountMinor).toBe(2500);
  });
});
