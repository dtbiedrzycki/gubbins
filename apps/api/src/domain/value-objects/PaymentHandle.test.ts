import { describe, expect, it } from 'vitest';
import { PaymentHandle } from './PaymentHandle.js';

describe('PaymentHandle.from', () => {
  it.each([['@my-venmo', 'my-venmo'], ['  my_venmo  ', 'my_venmo']])('normalizes the Venmo handle %j', (raw, expected) => {
    expect(PaymentHandle.from('venmo', raw).handle).toBe(expected);
  });
  it.each(['a'.repeat(5), 'a'.repeat(30)])('accepts a Venmo handle of 5 to 30 characters: %j', (raw) => {
    expect(PaymentHandle.from('venmo', raw).handle).toBe(raw);
  });
  it.each(['  ', 'a'.repeat(4), 'has space', 'a'.repeat(31), 'bad!chars'])('refuses a Venmo handle that is not 5 to 30 letters, digits, "_" or "-": %j', (raw) => {
    expect(() => PaymentHandle.from('venmo', raw)).toThrow(/Venmo/);
  });
  it.each([['Me@Example.com', 'me@example.com'], ['(555) 123-4567', '+15551234567'], ['+1 555 123 4567', '+15551234567']])('normalizes the Zelle handle %j', (raw, expected) => {
    expect(PaymentHandle.from('zelle', raw).handle).toBe(expected);
  });
  it.each(['  ', 'not-an-email', '555-1234', '+44 20 7946 0958'])('refuses Zelle handle %j', (raw) => {
    expect(() => PaymentHandle.from('zelle', raw)).toThrow(/Zelle/);
  });
  it.each([['venmo', '@my-venmo'], ['zelle', '(555) 123-4567'], ['zelle', 'Me@Example.com']] as const)('gives back its own normalized %s handle unchanged', (method, raw) => {
    const once = PaymentHandle.from(method, raw);
    expect(PaymentHandle.from(method, once.handle)).toEqual(once);
  });
});
