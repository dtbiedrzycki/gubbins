import { describe, expect, it } from 'vitest';
import { GuestDetails } from './GuestDetails.js';
import { DomainValidationError } from '../errors.js';

describe('GuestDetails.from', () => {
  it('trims the name and the message', () => {
    const d = GuestDetails.from({ name: '  Sam  ', message: '  Enjoy!  ' });
    expect(d.name).toBe('Sam');
    expect(d.message).toBe('Enjoy!');
  });

  it('refuses an empty or blank name', () => {
    expect(() => GuestDetails.from({ name: '' })).toThrow(/Name/);
    expect(() => GuestDetails.from({ name: '   ' })).toThrow(DomainValidationError);
  });

  it('accepts a name of 100 characters and refuses 101', () => {
    expect(GuestDetails.from({ name: 'a'.repeat(100) }).name).toHaveLength(100);
    expect(() => GuestDetails.from({ name: 'a'.repeat(101) })).toThrow(/Name/);
  });

  it('turns a missing or blank message into null', () => {
    expect(GuestDetails.from({ name: 'Sam' }).message).toBeNull();
    expect(GuestDetails.from({ name: 'Sam', message: '   ' }).message).toBeNull();
  });

  it('accepts a message of 300 characters and refuses 301', () => {
    expect(GuestDetails.from({ name: 'Sam', message: 'a'.repeat(300) }).message).toHaveLength(300);
    expect(() => GuestDetails.from({ name: 'Sam', message: 'a'.repeat(301) })).toThrow(/Message/);
  });
});
