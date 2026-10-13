import { DomainValidationError } from '../errors.js';

export const MAX_MONEY_MINOR = 10 ** 12; // ADR-0061: keeps sums in safe-integer range

/** USD in integer minor units (cents). */
export class Money {
  readonly currency = 'USD' as const;

  private constructor(readonly amountMinor: number) {}

  static usd(amountMinor: number): Money {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > MAX_MONEY_MINOR) {
      throw new DomainValidationError('Money must be a positive whole number of minor units within the limit');
    }
    return new Money(amountMinor);
  }
}
