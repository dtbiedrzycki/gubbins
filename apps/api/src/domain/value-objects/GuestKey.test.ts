import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../errors.js';
import { GuestKey } from './GuestKey.js';

describe('GuestKey', () => {
  it('limits a guest key to 32 characters', () => {
    expect(GuestKey.from('a'.repeat(32)).value).toHaveLength(32);
    expect(() => GuestKey.from('a'.repeat(33))).toThrow(DomainValidationError);
  });
});
