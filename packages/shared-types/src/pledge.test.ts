import { describe, expect, it } from 'vitest';
import { pledgeRequestSchema } from './pledge.js';

const pledge = { idempotencyKey: 'k', amountMinor: 2500, name: 'Ada' };

describe('pledgeRequestSchema', () => {
  it('accepts a payment handle of 254 characters and refuses 255', () => {
    const withHandle = (length: number) => pledgeRequestSchema.safeParse({ ...pledge, payment: { method: 'zelle', handle: 'a'.repeat(length) } }).success;
    expect([withHandle(254), withHandle(255)]).toEqual([true, false]);
  });

  it('refuses a payment method other than venmo or zelle', () => {
    expect(pledgeRequestSchema.safeParse({ ...pledge, payment: { method: 'paypal', handle: 'me@example.com' } }).success).toBe(false);
  });
});
