import type { Actor } from '../Actor.js';
import type { Hold } from '../entities/Hold.js';

/**
 * The credentials a caller presented, as the domain needs to see them.
 * Structural, so the application layer's AccessContext satisfies it without
 * domain/ importing application/ (ADR-0012).
 */
export interface HoldCredentials {
  guestSession: { sessionHash: string } | null;
}

/** The guest row: the session that placed the hold. */
function placedBy(hold: Hold, credentials: HoldCredentials): boolean {
  return credentials.guestSession !== null && hold.belongsToSession(credentials.guestSession.sessionHash);
}

/**
 * Who may do what to a hold. Each method answers with the role whose
 * credential authorises the command — which the use case records as the
 * event's actor (ADR-0075) — or null when no credential does. Guest
 * credentials are checked before owner ones, so a guest acting on their own
 * hold is recorded as the guest.
 *
 * Permissions only: whether the hold's *state* allows the command (extend
 * at most once, nothing on a closed hold) is the hold's own rule.
 */
export const HoldPermissions = {
  mayExtend(hold: Hold, credentials: HoldCredentials): Actor | null {
    return placedBy(hold, credentials) ? 'guest' : null;
  },
  mayRelease(hold: Hold, credentials: HoldCredentials): Actor | null {
    return placedBy(hold, credentials) ? 'guest' : null;
  },
  mayPurchase(hold: Hold, credentials: HoldCredentials): Actor | null {
    return placedBy(hold, credentials) ? 'guest' : null;
  },
};
