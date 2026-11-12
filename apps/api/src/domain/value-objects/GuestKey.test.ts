import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { GuestKey } from './GuestKey.js';

describe('GuestKey', () => {
  it('limits a guest key to 32 characters', () => {
    expect(GuestKey.from('a'.repeat(32)).value).toHaveLength(32);
    expect(() => GuestKey.from('a'.repeat(33))).toThrow(DomainValidationError);
  });

  const comparer = { compareInConstantTime: (a: string, b: string) => a === b };
  const stored = GuestKey.from('maple-lantern-otter');

  it.each(['Maple-Lantern-Otter', 'MAPLE-LANTERN-OTTER', 'maple lantern otter', 'maple  lantern   otter', 'maple - lantern - otter', 'maple--lantern-otter'])(
    'accepts %s typed for maple-lantern-otter',
    (typed) => expect(stored.matches(typed, comparer)).toBe(true),
  );

  it.each(['maple_lantern_otter', 'maple.lantern.otter', 'maplelanternotter', 'maple-lantern'])('refuses %s typed for maple-lantern-otter', (typed) =>
    expect(stored.matches(typed, comparer)).toBe(false),
  );

  it('compares a key that is not three words exactly as typed, spaces included', () => {
    const old = GuestKey.from('abc_d-0123456789abcdefghijklmnop');
    expect(old.matches('abc_d 0123456789abcdefghijklmnop', comparer)).toBe(false);
    expect(old.matches('ABC_D-0123456789abcdefghijklmnop', comparer)).toBe(false);
  });
});
