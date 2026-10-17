import { describe, expect, it } from 'vitest';
import { GuestKey } from './GuestKey.js';
import { HoldSecret } from './HoldSecret.js';
import { OwnerToken } from './OwnerToken.js';
import { DomainValidationError } from '../errors.js';

describe.each([
  ['GuestKey', GuestKey],
  ['HoldSecret', HoldSecret],
  ['OwnerToken', OwnerToken],
] as const)('%s', (_name, Secret) => {
  it('trims the value', () => {
    expect(Secret.from(' secret ').value).toBe('secret');
  });

  it('rejects an empty or blank value', () => {
    expect(() => Secret.from('')).toThrow(DomainValidationError);
    expect(() => Secret.from('   ')).toThrow(DomainValidationError);
  });

  it('trims the candidate before comparing', () => {
    const calls: Array<[string, string]> = [];
    const comparer = { compareInConstantTime: (a: string, b: string) => { calls.push([a, b]); return a === b; } };
    expect(Secret.from('secret').matches(' secret\n', comparer)).toBe(true);
    expect(calls).toEqual([['secret', 'secret']]);
  });

  it('leaves the comparison to the comparer it is given', () => {
    const calls: Array<[string, string]> = [];
    const comparer = { compareInConstantTime: (a: string, b: string) => { calls.push([a, b]); return false; } };
    expect(Secret.from('secret').matches('candidate', comparer)).toBe(false);
    expect(calls).toEqual([['secret', 'candidate']]);
  });
});
