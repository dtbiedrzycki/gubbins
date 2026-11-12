import { describe, expect, it } from 'vitest';
import { INVALID_REQUEST_MESSAGE } from '@gubbins/shared-types';
import { ApiError, NO_SERVER_MESSAGE } from '../api/client';
import { actionErrorMessage } from './actionErrorMessage';

describe('actionErrorMessage', () => {
  it('tells the guest to reload on a 404', () => {
    expect(actionErrorMessage(new ApiError(404, 'Hold not found'), 'Couldn’t hold this.'))
      .toBe('Couldn’t hold this. Reload the page to see the list as it is now.');
  });

  it.each([
    ['malformed-request 400', new ApiError(400, INVALID_REQUEST_MESSAGE)],
    ["proxy's 429 page with no message", new ApiError(429, NO_SERVER_MESSAGE)],
  ])('treats a %s as our fault', (_name, error) => {
    expect(actionErrorMessage(error, 'Couldn’t hold this.'))
      .toBe('Couldn’t hold this. Something went wrong on our end. Wait a moment, then try again.');
  });

  it.each([
    [500, 'The list could not be saved.'],
    [502, 'Request failed'],
  ])('puts the first sentence before a failure on our end for a %i, whatever the server called it', (status, message) => {
    expect(actionErrorMessage(new ApiError(status, message), 'Couldn’t move Rings.'))
      .toBe('Couldn’t move Rings. Something went wrong on our end. Wait a moment, then try again.');
  });

  it('says the owner seems to be offline when no response arrived', () => {
    expect(actionErrorMessage(new ApiError(0, "Couldn't reach the server. Check your connection and try again."), 'Couldn’t delete Rings.'))
      .toBe('Couldn’t delete Rings. You seem to be offline. Check your connection, then try again.');
  });

  it('says it failed on our end for an error that is not the API’s', () => {
    expect(actionErrorMessage(new TypeError('Unexpected token'), 'Couldn’t move Rings.'))
      .toBe('Couldn’t move Rings. Something went wrong on our end. Wait a moment, then try again.');
  });

  it('keeps the server’s own message for another refusal', () => {
    const reason = "Guests have already picked this one, so it can't be deleted.";
    expect(actionErrorMessage(new ApiError(409, reason, 'item_has_guest_history'), 'Couldn’t delete Rings.')).toBe(reason);
  });
});
