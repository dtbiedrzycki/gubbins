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

  it.each([
    ['a request that threw', new TypeError('Failed to fetch')],
    ['the client’s no-response error', new ApiError(0, "Couldn't reach the server. Check your connection and try again.")],
  ])('says the owner seems to be offline for %s', (_, error) => {
    expect(actionErrorMessage(error, 'delete', 'Rings'))
      .toBe('Couldn’t delete Rings. You seem to be offline. Check your connection, then try again.');
  });

  it('keeps the server’s own message for another refusal', () => {
    const reason = "Guests have already picked this one, so it can't be deleted.";
    expect(actionErrorMessage(new ApiError(409, reason, 'item_has_guest_history'), 'delete', 'Rings')).toBe(reason);
  });
});
