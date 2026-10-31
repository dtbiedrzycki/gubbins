import { describe, expect, it } from 'vitest';
import { ClockSystem } from './ClockSystem.js';
import { GUEST_KEY_WORDS, TokenGeneratorCrypto } from './TokenGeneratorCrypto.js';
import { SecretComparerCrypto } from './SecretComparerCrypto.js';
import { HasherSha256 } from './HasherSha256.js';
import { GuestKey } from '../domain/value-objects/GuestKey.js';
import { UuidId } from '../domain/value-objects/UuidId.js';

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

  it.each([
    [gen.generateGuestKey(), true],
    ['abacus-abdomen-able', true],
    ['Abacus-abdomen-able', false],
    ['abacus-abdomen', false],
    ['abacus-abdomen-able-ablaze', false],
    ['drop-down-abacus', false],
    ['abacus-abdomen-zzzz', false],
    ['abacus abdomen able', false],
    ['', false],
  ])('accepts only three listed words joined as the generator joins them (%j)', (candidate, expected) => {
    expect(gen.isGuestKey(candidate)).toBe(expected);
  });

  it('generates a guest key of three lowercase words joined by dashes', () => {
    expect(gen.generateGuestKey()).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  });

  it('never generates a guest key over 32 characters', () => {
    const longest = Math.max(...GUEST_KEY_WORDS.map((w) => w.length));
    expect(3 * longest + 2).toBeLessThanOrEqual(GuestKey.MAX_LENGTH);
    expect(() => GuestKey.from(gen.generateGuestKey())).not.toThrow();
  });

  /**
   * Asserted through `UuidId` rather than a local regex: the domain's
   * invariant is the thing that must hold, and a shape-only check here
   * would pass for the v4 that Node's `randomUUID()` returns — including
   * when handed a `{ version: 7 }` option it silently ignores.
   */
  it('generateEntityId produces an id the domain accepts', () => {
    expect(() => UuidId.from(gen.generateEntityId())).not.toThrow();
  });

  it('generateEntityId is monotonic within a millisecond', () => {
    // A burst this size reliably lands inside one millisecond, which is
    // where a v7 that fills the counter bits with randomness would sort
    // wrongly — `CreateList` mints two ids back to back.
    const ids = Array.from({ length: 32 }, () => gen.generateEntityId());
    expect([...ids].sort()).toEqual(ids);
  });

  it('generateSessionId stays a v4, and so is not a domain id', () => {
    const sessionId = gen.generateSessionId();
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(() => UuidId.from(sessionId)).toThrow();
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

  it('returns false for strings with the same character count but different byte lengths', () => {
    expect(comparer.compareInConstantTime('café', 'cafe')).toBe(false);
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
