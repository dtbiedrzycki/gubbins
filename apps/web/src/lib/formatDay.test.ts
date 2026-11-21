import { describe, expect, it } from 'vitest';
import { formatDay } from './formatDay';

// Noon UTC is the same calendar day from UTC−11 to UTC+11, so these hold in any CI zone.
describe('formatDay', () => {
  it('shows the month and day for a date this year', () => {
    expect(formatDay('2026-11-12T12:00:00.000Z', new Date('2026-11-21T12:00:00.000Z'))).toBe('Nov 12');
  });

  it('adds the year for a date in another year', () => {
    expect(formatDay('2025-12-30T12:00:00.000Z', new Date('2026-01-02T12:00:00.000Z'))).toBe('Dec 30, 2025');
  });
});
