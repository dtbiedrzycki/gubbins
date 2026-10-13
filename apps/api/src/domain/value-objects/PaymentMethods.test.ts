import { describe, expect, it } from 'vitest';
import { PaymentMethods } from './PaymentMethods.js';

describe('PaymentMethods.from', () => {
  it.each([['@my-venmo', 'my-venmo'], ['  my_venmo  ', 'my_venmo']])('normalizes the Venmo handle %j', (raw, expected) => {
    expect(PaymentMethods.from({ venmoHandle: raw }).venmoHandle).toBe(expected);
  });
  it.each(['ab', 'has space', 'a'.repeat(31), 'bad!chars'])('refuses Venmo handle %j', (raw) => {
    expect(() => PaymentMethods.from({ venmoHandle: raw })).toThrow(/Venmo/);
  });
  it.each([['Me@Example.com', 'me@example.com'], ['(555) 123-4567', '+15551234567'], ['+1 555 123 4567', '+15551234567']])('normalizes the Zelle handle %j', (raw, expected) => {
    expect(PaymentMethods.from({ zelleHandle: raw }).zelleHandle).toBe(expected);
  });
  it.each(['not-an-email', '555-1234', '+44 20 7946 0958'])('refuses Zelle handle %j', (raw) => {
    expect(() => PaymentMethods.from({ zelleHandle: raw })).toThrow(/Zelle/);
  });
  it('treats blank handles as absent', () => {
    expect(PaymentMethods.from({ venmoHandle: '  ', zelleHandle: '' }).isEmpty()).toBe(true);
  });
  it('is idempotent on its own output', () => {
    const once = PaymentMethods.from({ venmoHandle: '@my-venmo', zelleHandle: '(555) 123-4567' });
    const twice = PaymentMethods.from(once);
    expect([twice.venmoHandle, twice.zelleHandle]).toEqual([once.venmoHandle, once.zelleHandle]);
  });
});
