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

  it.each(['Maple-Lantern-Otter', 'maple  lantern   otter', 'maple - lantern - otter', 'maple--lantern-otter'])(
    'accepts %s typed for maple-lantern-otter',
    (typed) => expect(stored.matches(typed, comparer)).toBe(true),
  );

  it.each(['maple_lantern_otter', 'maple.lantern.otter', 'maplelanternotter', 'maple-lantern'])('refuses %s typed for maple-lantern-otter', (typed) =>
    expect(stored.matches(typed, comparer)).toBe(false),
  );

  it('holds Maple  Lantern-Otter as maple-lantern-otter', () => {
    expect(GuestKey.from('Maple  Lantern-Otter').value).toBe('maple-lantern-otter');
  });
});
