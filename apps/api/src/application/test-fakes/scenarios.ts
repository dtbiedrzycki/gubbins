import type { AccessContext } from '../AccessContext.js';
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../HoldPolicy.js';
import { HoldItem } from '../use-cases/HoldItem.js';
import { aWishlist } from './builders.js';
import { FakeHasher } from './FakeHasher.js';
import { FixedClock } from './FixedClock.js';
import { inMemoryPersistence } from './InMemoryRepositories.js';
import { SequentialTokenGenerator } from './SequentialTokenGenerator.js';

export const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
export const ITEM_ID = '33333333-3333-7333-8333-333333333333';
export const OTHER_WISHLIST_ID = '22222222-2222-7222-8222-222222222222';
export const OTHER_ITEM_ID = '44444444-4444-7444-8444-444444444444';
export const T0 = new Date('2026-01-01T00:00:00.000Z');
export const DAY = 24 * 60 * 60 * 1000;

export const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };
export const OTHER_GUEST: AccessContext = { guestSession: { sessionHash: 'b'.repeat(64) } };
export const NO_SESSION: AccessContext = { guestSession: null };

/**
 * Two one-item lists in one in-memory store, a clock at T0, and a HoldItem
 * to place holds through — the starting point the hold-command tests share.
 * List A is the one under test; list B exists so every command can be shown
 * refusing a hold from a list it was not loaded for (IDOR).
 */
export async function twoListsWithOneItemEach(policy: HoldPolicy = DEFAULT_HOLD_POLICY) {
  const persistence = inMemoryPersistence();
  const clock = new FixedClock(T0);
  await persistence.wishlists.insert(aWishlist().withId(WISHLIST_ID).withItem({ id: ITEM_ID, title: 'Stroller' }).build());
  await persistence.wishlists.insert(
    aWishlist().withId(OTHER_WISHLIST_ID).withSlug('def456').withItem({ id: OTHER_ITEM_ID, title: 'Toaster' }).build(),
  );
  const holdItem = new HoldItem(persistence.unitOfWork, new SequentialTokenGenerator(), clock, new FakeHasher(), policy);
  let taps = 0;

  /** Places a hold on list A's item — or list B's, with `onOtherList` — as `access`. */
  function placeHold(access: AccessContext = GUEST, onOtherList = false) {
    taps += 1;
    const target = onOtherList ? { wishlistId: OTHER_WISHLIST_ID, itemId: OTHER_ITEM_ID } : { wishlistId: WISHLIST_ID, itemId: ITEM_ID };
    return holdItem.execute({ ...target, idempotencyKey: `tap-${taps}` }, access);
  }

  return { ...persistence, clock, policy, placeHold };
}
