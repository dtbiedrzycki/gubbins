import { describe, expect, it } from 'vitest';
import { UuidId } from './UuidId.js';
import { DomainValidationError } from '../errors.js';

describe('UuidId.from', () => {
  it('accepts a valid UUID v4', () => {
    expect(UuidId.from('11111111-1111-4111-8111-111111111111').value).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects a value that is not a UUID at all', () => {
    expect(() => UuidId.from('not-a-uuid')).toThrow(DomainValidationError);
  });

  it('rejects a UUID whose version is not 4', () => {
    expect(() => UuidId.from('11111111-1111-1111-8111-111111111111')).toThrow(DomainValidationError);
  });

  it('rejects a UUID whose variant nibble is out of range', () => {
    expect(() => UuidId.from('11111111-1111-4111-7111-111111111111')).toThrow(DomainValidationError);
  });

  it('states the invariant in the error message', () => {
    expect(() => UuidId.from('nope')).toThrow('Id must be a valid UUID v4');
  });
});
