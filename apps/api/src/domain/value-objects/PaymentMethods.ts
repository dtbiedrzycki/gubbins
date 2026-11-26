import { PaymentHandle, type PaymentMethod } from './PaymentHandle.js';

// A blank handle means the owner gave none for that method.
const handleOf = (raw: string | null | undefined, method: PaymentMethod): string | null =>
  raw?.trim() ? PaymentHandle.from(method, raw).handle : null;

/** How guests can pay for a group gift. Handles are normalized once, here. */
export class PaymentMethods {
  static readonly none = new PaymentMethods(null, null);

  private constructor(readonly venmoHandle: string | null, readonly zelleHandle: string | null) {}

  static from(props: { venmoHandle?: string | null; zelleHandle?: string | null }): PaymentMethods {
    return new PaymentMethods(handleOf(props.venmoHandle, 'venmo'), handleOf(props.zelleHandle, 'zelle'));
  }

  isEmpty(): boolean {
    return this.venmoHandle === null && this.zelleHandle === null;
  }
}
