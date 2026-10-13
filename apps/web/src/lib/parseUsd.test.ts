import { describe, expect, it } from 'vitest';
import { parseUsd } from './parseUsd';

describe('parseUsd', () => {
  it.each([['50', 5000], ['$50', 5000], ['50.5', 5050], ['1,250.00', 125000], [' 12.34 ', 1234]])('%j → %j', (input, cents) => {
    expect(parseUsd(input)).toBe(cents);
  });
  it.each(['', '0', '0.00', '-5', '50.555', 'abc', '1,2,3', '$', '1e3'])('%j → null', (input) => {
    expect(parseUsd(input)).toBeNull();
  });
});
