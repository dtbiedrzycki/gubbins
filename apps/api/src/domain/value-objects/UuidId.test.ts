import { describe, expect, it } from 'vitest';
import { createUuidId } from './UuidId.js';
import { DomainValidationError } from '../errors.js';

describe('createUuidId', () => {
  const TestId = createUuidId('TestId');

  it('accepts a valid UUID v4', () => {
    const id = TestId.from('11111111-1111-4111-8111-111111111111');
    expect(id.value).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects a value that is not a valid UUID v4', () => {
    expect(() => TestId.from('not-a-uuid')).toThrow(DomainValidationError);
  });

  it('includes the brand name in the error message', () => {
    expect(() => TestId.from('nope')).toThrow('TestId must be a valid UUID v4');
  });
});
