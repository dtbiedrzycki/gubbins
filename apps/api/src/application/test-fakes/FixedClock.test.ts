import { describe, expect, it } from 'vitest';
import { FixedClock } from './FixedClock.js';

describe('FixedClock', () => {
  it('returns the injected time', () => {
    const fixed = new Date('2026-01-01T00:00:00Z');
    const clock = new FixedClock(fixed);
    expect(clock.now()).toEqual(fixed);
  });

  it('advance() moves the clock forward by the given milliseconds', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    clock.advance(1000);
    expect(clock.now()).toEqual(new Date('2026-01-01T00:00:01Z'));
  });
});
