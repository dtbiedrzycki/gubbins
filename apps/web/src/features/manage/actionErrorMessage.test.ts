import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import { actionErrorMessage } from './actionErrorMessage';

describe('actionErrorMessage', () => {
  it.each([
    ['move', 500, 'The list could not be saved.'],
    ['move', 502, 'Request failed'],
    ['delete', 500, 'The list could not be saved.'],
  ] as const)('says a %s failed on our end for a %i, whatever the server called it', (action, status, message) => {
    expect(actionErrorMessage(new ApiError(status, message), action, 'Rings'))
      .toBe(`Couldn’t ${action} Rings. Something went wrong on our end. Wait a moment, then try again.`);
  });

  it('says the owner seems to be offline when no response arrived', () => {
    expect(actionErrorMessage(new ApiError(0, "Couldn't reach the server. Check your connection and try again."), 'delete', 'Rings'))
      .toBe('Couldn’t delete Rings. You seem to be offline. Check your connection, then try again.');
  });

  it('says it failed on our end for an error that is not the API’s', () => {
    expect(actionErrorMessage(new TypeError('Unexpected token'), 'move', 'Rings'))
      .toBe('Couldn’t move Rings. Something went wrong on our end. Wait a moment, then try again.');
  });

  it('keeps the server’s own message for another refusal', () => {
    const reason = "Guests have already picked this one, so it can't be deleted.";
    expect(actionErrorMessage(new ApiError(409, reason, 'item_has_guest_history'), 'delete', 'Rings')).toBe(reason);
  });
});
