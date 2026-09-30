import { describe, expect, it } from 'vitest';
import { SessionHash } from './SessionHash.js';
import { DomainValidationError } from '../errors.js';

const VALID_HASH = 'a'.repeat(64);

describe('SessionHash.from', () => {
  it('accepts a 64-character hex string', () => {
    expect(SessionHash.from(VALID_HASH).value).toBe(VALID_HASH);
  });

  it('accepts uppercase hex characters', () => {
    const upper = 'A'.repeat(64);
    expect(SessionHash.from(upper).value).toBe(upper);
  });

  it('rejects a string shorter than 64 characters', () => {
    expect(() => SessionHash.from('a'.repeat(63))).toThrow(DomainValidationError);
  });

  it('rejects a string longer than 64 characters', () => {
    expect(() => SessionHash.from('a'.repeat(65))).toThrow(DomainValidationError);
  });

  it('rejects non-hex characters', () => {
    expect(() => SessionHash.from('g'.repeat(64))).toThrow(DomainValidationError);
  });

  it('rejects an empty string', () => {
    expect(() => SessionHash.from('')).toThrow(DomainValidationError);
  });
});
