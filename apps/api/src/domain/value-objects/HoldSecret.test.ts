import { describe, expect, it } from 'vitest';
import { HoldSecret } from './HoldSecret.js';
import { DomainValidationError } from '../errors.js';

const exactComparer = { compareInConstantTime: (a: string, b: string) => a === b };

describe('HoldSecret', () => {
  it('exposes the raw secret as .value', () => {
    expect(HoldSecret.from('hold-secret').value).toBe('hold-secret');
  });

  it('does not trim — bearer secrets are opaque', () => {
    expect(HoldSecret.from(' hold-secret ').value).toBe(' hold-secret ');
  });

  it('rejects an empty secret', () => {
    expect(() => HoldSecret.from('')).toThrow(DomainValidationError);
  });

  it('matches an identical candidate via the comparer', () => {
    expect(HoldSecret.from('hold-secret').matches('hold-secret', exactComparer)).toBe(true);
  });

  it('does not match a different candidate', () => {
    expect(HoldSecret.from('hold-secret').matches('other-secret', exactComparer)).toBe(false);
  });

  it('delegates the comparison to the comparer rather than comparing inline', () => {
    const calls: Array<[string, string]> = [];
    const alwaysTrue = {
      compareInConstantTime: (a: string, b: string) => {
        calls.push([a, b]);
        return true;
      },
    };
    expect(HoldSecret.from('hold-secret').matches('nope', alwaysTrue)).toBe(true);
    expect(calls).toEqual([['hold-secret', 'nope']]);
  });
});
