import { describe, expect, it } from 'vitest';
import { PaymentHandle } from './PaymentHandle.js';
import { PaymentMethods } from './PaymentMethods.js';

describe('PaymentMethods.mint', () => {
  it('treats blank handles as absent', () => {
    const ids = { generateEntityId: () => '66666666-6666-7666-8666-666666666666' };
    expect(PaymentMethods.mint({ venmoHandle: '  ', zelleHandle: '' }, ids).isEmpty()).toBe(true);
  });
});

describe('PaymentMethods.isCurrent', () => {
  const list = PaymentMethods.reconstitute({ venmo: { id: '66666666-6666-7666-8666-666666666666', handle: 'my-venmo' }, zelle: null });

  it('counts a Venmo handle as current whatever its capitals', () => {
    expect(list.isCurrent(PaymentHandle.from('venmo', 'My-Venmo'))).toBe(true);
  });
  it('counts a handle as not current once it differs', () => {
    expect(list.isCurrent(PaymentHandle.from('venmo', 'old-venmo'))).toBe(false);
  });
  it('counts a handle as not current when the list has none for its method', () => {
    expect(list.isCurrent(PaymentHandle.from('zelle', 'me@example.com'))).toBe(false);
  });
});
