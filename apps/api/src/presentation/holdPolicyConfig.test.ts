import { describe, expect, it } from 'vitest';
import { parseHoldPolicy } from './holdPolicyConfig.js';

describe('parseHoldPolicy — HOLD_DURATION_DAYS (ops)', () => {
  it.each([
    ['unset', undefined, 3],
    ['empty, as compose passes an unset variable through', '', 3],
    ['1', '1', 1],
    ['14', '14', 14],
  ])('reads %s as %i days', (_name, raw, days) => {
    expect(parseHoldPolicy({ HOLD_DURATION_DAYS: raw })).toEqual({ durationDays: days });
  });

  it.each(['0', '-1', '1.5', '3d', 'abc', ' 2', '2 ', '1e3', '03'])('refuses %j, naming the variable', (raw) => {
    expect(() => parseHoldPolicy({ HOLD_DURATION_DAYS: raw })).toThrow(/HOLD_DURATION_DAYS must be a whole number of days, 1 or more/);
  });
});
