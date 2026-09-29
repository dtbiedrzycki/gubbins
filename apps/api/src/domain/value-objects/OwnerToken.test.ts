import { describe, expect, it } from 'vitest';
import { OwnerToken } from './OwnerToken.js';
import { DomainValidationError } from '../errors.js';

const exactComparer = { compareInConstantTime: (a: string, b: string) => a === b };

describe('OwnerToken', () => {
  it('exposes the raw token as .value', () => {
    expect(OwnerToken.from('owner-tok').value).toBe('owner-tok');
  });

  it('does not trim — bearer tokens are opaque', () => {
    expect(OwnerToken.from(' owner-tok ').value).toBe(' owner-tok ');
  });

  it('rejects an empty token', () => {
    expect(() => OwnerToken.from('')).toThrow(DomainValidationError);
  });

  it('matches an identical candidate via the comparer', () => {
    expect(OwnerToken.from('owner-tok').matches('owner-tok', exactComparer)).toBe(true);
  });

  it('does not match a different candidate', () => {
    expect(OwnerToken.from('owner-tok').matches('other-tok', exactComparer)).toBe(false);
  });

  it('delegates the comparison to the comparer rather than comparing inline', () => {
    const calls: Array<[string, string]> = [];
    const alwaysTrue = {
      compareInConstantTime: (a: string, b: string) => {
        calls.push([a, b]);
        return true;
      },
    };
    expect(OwnerToken.from('owner-tok').matches('nope', alwaysTrue)).toBe(true);
    expect(calls).toEqual([['owner-tok', 'nope']]);
  });
});
