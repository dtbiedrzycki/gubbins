import { describe, expect, it } from 'vitest';
import { PaymentMethods } from './PaymentMethods.js';

describe('PaymentMethods.mint', () => {
  it('treats blank handles as absent', () => {
    const ids = { generateEntityId: () => '66666666-6666-7666-8666-666666666666' };
    expect(PaymentMethods.mint({ venmoHandle: '  ', zelleHandle: '' }, ids).isEmpty()).toBe(true);
  });
});
