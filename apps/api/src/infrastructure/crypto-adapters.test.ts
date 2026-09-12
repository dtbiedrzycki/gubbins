import { describe, expect, it } from 'vitest';
import { ClockSystem } from './ClockSystem.js';
import { TokenGeneratorCrypto } from './TokenGeneratorCrypto.js';
import { SecretComparerCrypto } from './SecretComparerCrypto.js';
import { HasherSha256 } from './HasherSha256.js';

describe('ClockSystem', () => {
  it('returns a Date close to the actual current time', () => {
    const before = Date.now();
    const now = new ClockSystem().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('TokenGeneratorCrypto', () => {
  const gen = new TokenGeneratorCrypto();

  it('produces non-empty, distinct values across calls', () => {
    const a = gen.generateHoldSecret();
    const b = gen.generateHoldSecret();
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('generateId produces a valid UUID', () => {
    const id = gen.generateId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('SecretComparerCrypto', () => {
  const comparer = new SecretComparerCrypto();

  it('returns true for equal strings', () => {
    expect(comparer.compareInConstantTime('secret', 'secret')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(comparer.compareInConstantTime('secret', 'secrat')).toBe(false);
  });

  it('returns false (not throws) for strings of different lengths', () => {
    expect(comparer.compareInConstantTime('short', 'a much longer string')).toBe(false);
  });
});

describe('HasherSha256', () => {
  const hasher = new HasherSha256();

  it('produces the same hash for the same input', () => {
    expect(hasher.hash('session-abc')).toBe(hasher.hash('session-abc'));
  });

  it('produces different hashes for different input', () => {
    expect(hasher.hash('session-abc')).not.toBe(hasher.hash('session-xyz'));
  });

  it('produces a 64-character hex string', () => {
    expect(hasher.hash('session-abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
