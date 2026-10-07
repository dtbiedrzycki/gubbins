import type { ErrorResponse } from '@gubbins/shared-types';
import {
  ConcurrencyError, HoldAlreadyExtendedError, HoldLapsedError, HoldNotActiveError, HoldNotFoundError,
  ItemNotFoundError, ItemUnavailableError, WishlistNotFoundError,
} from '../domain/errors.js';

export const NOT_FOUND = { message: 'Not found' } as const;

/**
 * The one table from domain failure to HTTP answer — only presentation maps
 * to status codes (backend architecture). Every way of failing to reach a
 * list, item or hold is the same generic 404 (ADR-0016/0054). The 409
 * messages reach the guest as they are, so they are written for a person;
 * `code` is for the client to branch on.
 */
export function domainErrorResponse(err: unknown): { status: 404 | 409; body: ErrorResponse } | null {
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
  return null;
}
