import { describe, expect, it } from 'vitest';
import { domainErrorResponse } from './domainErrorResponse.js';
import {
  ConcurrencyError, HoldAlreadyExtendedError, HoldLapsedError, HoldNotActiveError, HoldNotFoundError,
  InvalidGuestKeyError, ItemNotFoundError, ItemUnavailableError, WishlistNotFoundError,
} from '../domain/errors.js';

describe('domainErrorResponse', () => {
  it.each([
    ['WishlistNotFoundError', new WishlistNotFoundError('x')],
    ['ItemNotFoundError', new ItemNotFoundError('x')],
    ['HoldNotFoundError', new HoldNotFoundError('x')],
  ])('answers %s with the generic 404 (ADR-0016/0054)', (_name, err) => {
    expect(domainErrorResponse(err)).toEqual({ status: 404, body: { message: 'Not found' } });
  });

  it.each([
    ['ItemUnavailableError', new ItemUnavailableError('x'), 'item_unavailable', 'This item is no longer available.'],
    ['HoldLapsedError', new HoldLapsedError('x'), 'item_unavailable', 'Your hold expired and this gift has since been held or bought by someone else.'],
    ['HoldNotActiveError', new HoldNotActiveError('x'), 'hold_not_active', 'This hold is no longer active.'],
    ['HoldAlreadyExtendedError', new HoldAlreadyExtendedError('x'), 'hold_already_extended', 'This hold has already been extended.'],
  ])('answers %s with 409 and a code the client can branch on', (_name, err, code, message) => {
    expect(domainErrorResponse(err)).toEqual({ status: 409, body: { message, code } });
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
