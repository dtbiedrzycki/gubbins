import { describe, expect, it } from 'vitest';
import { HoldPermissions } from './HoldPermissions.js';
import { Hold } from '../entities/Hold.js';

const SESSION = 'a'.repeat(64);
const hold = Hold.reconstitute({
  id: '55555555-5555-7555-8555-555555555555', itemId: '33333333-3333-7333-8333-333333333333',
  secret: 'hold-secret', sessionHash: SESSION, idempotencyKey: 'idem-1',
  expiresAt: new Date('2026-01-04T00:00:00.000Z'), extendedAt: null, releasedAt: null, purchasedAt: null,
});
const commands = ['mayExtend', 'mayRelease', 'mayPurchase'] as const;

describe('HoldPermissions — guest rows (holds-lifecycle §1, stack A)', () => {
  it.each(commands)('%s: the session that placed the hold acts, as the guest', (command) => {
    expect(HoldPermissions[command](hold, { guestSession: { sessionHash: SESSION } })).toBe('guest');
  });

  it.each(commands)('%s: another session may not', (command) => {
    expect(HoldPermissions[command](hold, { guestSession: { sessionHash: 'b'.repeat(64) } })).toBeNull();
  });

  it.each(commands)('%s: a caller with no session may not', (command) => {
    expect(HoldPermissions[command](hold, { guestSession: null })).toBeNull();
  });
});
