import { describe, expect, it } from 'vitest';
import { PaymentHandle } from './PaymentHandle.js';

describe('PaymentHandle.from', () => {
  it.each([['@my-venmo', 'my-venmo'], ['  my_venmo  ', 'my_venmo']])('normalizes the Venmo handle %j', (raw, expected) => {
    expect(PaymentHandle.from('venmo', raw).handle).toBe(expected);
  });
  it.each(['  ', 'ab', 'has space', 'a'.repeat(31), 'bad!chars'])('refuses Venmo handle %j', (raw) => {
    expect(() => PaymentHandle.from('venmo', raw)).toThrow(/Venmo/);
  });
  it.each([['Me@Example.com', 'me@example.com'], ['(555) 123-4567', '+15551234567'], ['+1 555 123 4567', '+15551234567']])('normalizes the Zelle handle %j', (raw, expected) => {
    expect(PaymentHandle.from('zelle', raw).handle).toBe(expected);
  });
  it.each(['  ', 'not-an-email', '555-1234', '+44 20 7946 0958'])('refuses Zelle handle %j', (raw) => {
    expect(() => PaymentHandle.from('zelle', raw)).toThrow(/Zelle/);
  });
  it.each([['venmo', '@my-venmo'], ['zelle', '(555) 123-4567'], ['zelle', 'Me@Example.com']] as const)('accepts its own %s output again', (method, raw) => {
    const once = PaymentHandle.from(method, raw);
    expect(PaymentHandle.from(method, once.handle)).toEqual(once);
  });
});
