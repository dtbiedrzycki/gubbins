import { describe, expect, it } from 'vitest';
import { PaymentMethods } from './PaymentMethods.js';

describe('PaymentMethods.from', () => {
  it('treats blank handles as absent', () => {
    expect(PaymentMethods.from({ venmoHandle: '  ', zelleHandle: '' }).isEmpty()).toBe(true);
  });
});
