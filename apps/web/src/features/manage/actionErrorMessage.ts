import { ApiError } from '../../api/client';

/** What a failed move or delete tells the owner: which gift, what went wrong, and what to do. */
export function actionErrorMessage(error: Error, action: 'move' | 'delete', title: string): string {
  const couldnt = `Couldn’t ${action} ${title}.`;
  // The client turns every fetch rejection into an ApiError with status 0, so that is the only "no response" case.
  if (error instanceof ApiError && error.status === 0) return `${couldnt} You seem to be offline. Check your connection, then try again.`;
  if (!(error instanceof ApiError) || error.status >= 500) return `${couldnt} Something went wrong on our end. Wait a moment, then try again.`;
  return error.message;
}
