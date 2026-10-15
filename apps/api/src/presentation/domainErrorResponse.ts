import type { ErrorResponse } from '@gubbins/shared-types';
import {
  ConcurrencyError, DomainValidationError, HoldAlreadyExtendedError, HoldLapsedError, HoldNotActiveError, HoldNotFoundError,
  InvalidCreateSecretError, ItemNotFoundError, ItemUnavailableError, NoPaymentMethodError, WishlistNotFoundError,
} from '../domain/errors.js';

export const NOT_FOUND = { message: 'Not found' } as const;

/**
 * The one table from domain failure to HTTP answer — only presentation maps
 * to status codes (backend architecture). A missing or wrong create secret
 * is a bare 403 that says nothing more (ADR-0080). Every way of failing to reach a
 * list, item or hold is the same generic 404 (ADR-0016/0054). The 409
 * messages reach the guest as they are, so they are written for a person;
 * `code` is for the client to branch on. Any other domain validation failure
 * is a 400 carrying the rule's own message.
 */
export function domainErrorResponse(err: unknown): { status: 400 | 403 | 404 | 409; body: ErrorResponse } | null {
  if (err instanceof InvalidCreateSecretError) {
    return { status: 403, body: { message: 'Not allowed' } };
  }
  if (err instanceof WishlistNotFoundError || err instanceof ItemNotFoundError || err instanceof HoldNotFoundError) {
    return { status: 404, body: NOT_FOUND };
  }
  // Before its parent: an expired hold bought after its unit went elsewhere.
  if (err instanceof HoldLapsedError) {
    return { status: 409, body: { message: 'Your hold expired and this gift has since been held or bought by someone else.', code: 'item_unavailable' } };
  }
  if (err instanceof ItemUnavailableError) {
    return { status: 409, body: { message: 'This item is no longer available.', code: 'item_unavailable' } };
  }
  if (err instanceof HoldNotActiveError) {
    return { status: 409, body: { message: 'This hold is no longer active.', code: 'hold_not_active' } };
  }
  if (err instanceof HoldAlreadyExtendedError) {
    return { status: 409, body: { message: 'This hold has already been extended.', code: 'hold_already_extended' } };
  }
  // Still conflicting after RetryingUnitOfWork's retries.
  if (err instanceof ConcurrencyError) {
    return { status: 409, body: { message: 'Someone else changed this at the same moment. Please try again.' } };
  }
  if (err instanceof NoPaymentMethodError) {
    return { status: 409, body: { message: 'Add a Venmo or Zelle handle to this list before adding a group gift.', code: 'no_payment_method' } };
  }
  // Catch-all for rules zod doesn't know; domain messages are written to be shown.
  if (err instanceof DomainValidationError) {
    return { status: 400, body: { message: err.message } };
  }
  return null;
}
