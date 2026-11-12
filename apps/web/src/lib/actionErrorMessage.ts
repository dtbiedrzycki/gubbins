import { INVALID_REQUEST_MESSAGE } from '@gubbins/shared-types';
import { ApiError, NO_SERVER_MESSAGE } from '../api/client';

/** The text for a failure that is not the reader's to fix. */
export function ourEndMessage(couldnt: string): string {
  return `${couldnt} Something went wrong on our end. Wait a moment, then try again.`;
}

/** What a failed action tells the reader: what could not be done, what went wrong, and what to do. */
export function actionErrorMessage(error: Error, couldnt: string): string {
  // The client turns every fetch rejection into an ApiError with status 0, so that is the only "no response" case.
  if (error instanceof ApiError && error.status === 0) return `${couldnt} You seem to be offline. Check your connection, then try again.`;
  if (!(error instanceof ApiError) || error.status >= 500) return ourEndMessage(couldnt);
  if (error.status === 404) return `${couldnt} Reload the page to see the list as it is now.`;
  // No domain wording: a malformed request or a proxy's error page, neither of which the reader can fix.
  if (error.message === INVALID_REQUEST_MESSAGE || error.message === NO_SERVER_MESSAGE) return ourEndMessage(couldnt);
  return error.message;
}
