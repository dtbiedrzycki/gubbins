import { describe, expect, it } from 'vitest';
import { UuidId } from './UuidId.js';
import { DomainValidationError } from '../errors.js';

describe('UuidId.from', () => {
  it('accepts a valid UUID v7', () => {
    expect(UuidId.from('11111111-1111-7111-8111-111111111111').value).toBe('11111111-1111-7111-8111-111111111111');
  });

  it('rejects a value that is not a UUID at all', () => {
    expect(() => UuidId.from('not-a-uuid')).toThrow(DomainValidationError);
  });

  it('rejects a UUID whose version is not 7', () => {
    expect(() => UuidId.from('11111111-1111-1111-8111-111111111111')).toThrow(DomainValidationError);
  });

  /**
   * The version this codebase used before ADR-0076, and the version Node's
   * own `randomUUID()` produces — including when handed a `{ version: 7 }`
   * option, which it silently ignores. Rejecting it here is what turns that
   * silent substitution into a loud failure.
   */
  it('rejects a UUID v4', () => {
    expect(() => UuidId.from('11111111-1111-4111-8111-111111111111')).toThrow(DomainValidationError);
  });

  it('rejects a UUID whose variant nibble is out of range', () => {
    expect(() => UuidId.from('11111111-1111-7111-7111-111111111111')).toThrow(DomainValidationError);
  });

  it('states the invariant in the error message', () => {
    expect(() => UuidId.from('nope')).toThrow('Id must be a valid UUID v7');
  });
});
