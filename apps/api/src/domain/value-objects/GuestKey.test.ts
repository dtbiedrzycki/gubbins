import { describe, expect, it } from 'vitest';
import { GuestKey } from './GuestKey.js';
import { DomainValidationError } from '../errors.js';

const exactComparer = { constantTimeEqual: (a: string, b: string) => a === b };

describe('GuestKey', () => {
  it('exposes the raw key as .value', () => {
    expect(GuestKey.from('guest-key').value).toBe('guest-key');
  });

  it('does not trim — bearer keys are opaque', () => {
    expect(GuestKey.from(' guest-key ').value).toBe(' guest-key ');
  });

  it('rejects an empty key', () => {
    expect(() => GuestKey.from('')).toThrow(DomainValidationError);
  });

  it('matches an identical candidate via the comparer', () => {
    expect(GuestKey.from('guest-key').matches('guest-key', exactComparer)).toBe(true);
  });

  it('does not match a different candidate', () => {
    expect(GuestKey.from('guest-key').matches('stale-key', exactComparer)).toBe(false);
  });

  it('delegates the comparison to the comparer rather than comparing inline', () => {
    const calls: Array<[string, string]> = [];
    const alwaysTrue = {
      constantTimeEqual: (a: string, b: string) => {
        calls.push([a, b]);
        return true;
      },
    };
    expect(GuestKey.from('guest-key').matches('nope', alwaysTrue)).toBe(true);
    expect(calls).toEqual([['guest-key', 'nope']]);
  });
});
