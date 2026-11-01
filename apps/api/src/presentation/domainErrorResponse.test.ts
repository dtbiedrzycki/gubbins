import { describe, expect, it } from 'vitest';
import { domainErrorResponse } from './domainErrorResponse.js';
import {
  ConcurrencyError, ContributionAmountError, DomainValidationError, NoPaymentMethodError, HoldAlreadyExtendedError, HoldLapsedError, HoldNotActiveError, HoldNotFoundError,
  InvalidCreateSecretError, InvalidGuestKeyError, ItemHasGuestHistoryError, ItemNotFoundError, ItemUnavailableError, WishlistNotFoundError,
} from '../domain/errors.js';

describe('domainErrorResponse', () => {
  it.each([
    ['WishlistNotFoundError', new WishlistNotFoundError('x')],
    ['ItemNotFoundError', new ItemNotFoundError('x')],
    ['HoldNotFoundError', new HoldNotFoundError('x')],
  ])('answers %s with the generic 404 (ADR-0016/0054)', (_name, err) => {
    expect(domainErrorResponse(err)).toEqual({ status: 404, body: { message: 'Not found' } });
  });

  it('answers an InvalidCreateSecretError with a 403 that says nothing more', () => {
    expect(domainErrorResponse(new InvalidCreateSecretError())).toEqual({ status: 403, body: { message: 'Not allowed' } });
  });

  it.each([
    ['ItemUnavailableError', new ItemUnavailableError('x'), 'item_unavailable', 'This item is no longer available.'],
    ['HoldLapsedError', new HoldLapsedError('x'), 'item_unavailable', 'Your hold expired and this gift has since been held or bought by someone else.'],
    ['HoldNotActiveError', new HoldNotActiveError('x'), 'hold_not_active', 'This hold is no longer active.'],
    ['HoldAlreadyExtendedError', new HoldAlreadyExtendedError('x'), 'hold_already_extended', 'This hold has already been extended.'],
    ['NoPaymentMethodError', new NoPaymentMethodError(), 'no_payment_method', 'Add a Venmo or Zelle handle to this list before adding a group gift.'],
    ['ContributionAmountError', new ContributionAmountError('x'), 'amount_out_of_range', 'That amount is more than this gift can take. Try a smaller amount.'],
    ['ItemHasGuestHistoryError', new ItemHasGuestHistoryError('x'), 'item_has_guest_history', "Guests have already picked this one, so it can't be deleted."],
  ])('answers %s with 409 and a code the client can branch on', (_name, err, code, message) => {
    expect(domainErrorResponse(err)).toEqual({ status: 409, body: { message, code } });
  });

  it('answers a DomainValidationError with 400 and its own message', () => {
    expect(domainErrorResponse(new DomainValidationError('Venmo handle is invalid'))).toEqual({
      status: 400, body: { message: 'Venmo handle is invalid' },
    });
  });

  it('answers a ConcurrencyError that outlived its retries with a 409 and no code', () => {
    expect(domainErrorResponse(new ConcurrencyError('i', 0, 1))).toEqual({
      status: 409, body: { message: 'Someone else changed this at the same moment. Please try again.' },
    });
  });

  it('leaves everything else — key entry included, which answers for itself — to its caller', () => {
    expect(domainErrorResponse(new Error('boom'))).toBeNull();
    expect(domainErrorResponse(new InvalidGuestKeyError('w'))).toBeNull();
  });
});
