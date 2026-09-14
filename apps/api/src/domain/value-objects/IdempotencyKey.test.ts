import { describe, expect, it } from 'vitest';
import { IdempotencyKey } from './IdempotencyKey.js';
import { DomainValidationError } from '../errors.js';

describe('IdempotencyKey.from', () => {
  it('accepts a non-empty string', () => {
    expect(IdempotencyKey.from('idem-1').value).toBe('idem-1');
  });

  it('accepts a string at the 200-character bound', () => {
    const key = 'a'.repeat(200);
    expect(IdempotencyKey.from(key).value).toBe(key);
  });

  it('rejects an empty string', () => {
    expect(() => IdempotencyKey.from('')).toThrow(DomainValidationError);
  });

  it('rejects a string over 200 characters', () => {
    expect(() => IdempotencyKey.from('a'.repeat(201))).toThrow(DomainValidationError);
  });
});
