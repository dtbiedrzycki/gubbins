import { ApiError } from '../../api/client';

/** What a failed owner action tells the owner: what could not be done, what went wrong, and what to do. */
export function actionErrorMessage(error: Error, couldnt: string): string {
  // The client turns every fetch rejection into an ApiError with status 0, so that is the only "no response" case.
  if (error instanceof ApiError && error.status === 0) return `${couldnt} You seem to be offline. Check your connection, then try again.`;
  if (!(error instanceof ApiError) || error.status >= 500) return `${couldnt} Something went wrong on our end. Wait a moment, then try again.`;
  return error.message;
}
