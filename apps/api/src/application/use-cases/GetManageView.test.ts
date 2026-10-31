import { describe, expect, it } from 'vitest';
import { GetManageView } from './GetManageView.js';
import { HoldItem } from './HoldItem.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { GUEST, ITEM_ID, OTHER_ITEM_ID, T0, WISHLIST_ID } from '../test-fakes/scenarios.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

const OWNER = { guestSession: null, owner: true };

async function setup() {
  const persistence = inMemoryPersistence();
  const clock = new FixedClock(T0);
  await persistence.wishlists.insert(
    aWishlist().withId(WISHLIST_ID).withKey('the-key')
      .withItem({ id: ITEM_ID, title: 'Stroller' }).withItem({ id: OTHER_ITEM_ID, title: 'Toaster' }).build(),
  );
  await new HoldItem(persistence.unitOfWork, new SequentialTokenGenerator(), clock, new FakeHasher(), { durationDays: 3 })
    .execute({ wishlistId: WISHLIST_ID, itemId: OTHER_ITEM_ID, idempotencyKey: 'tap-1', name: 'Ada' }, GUEST);
  return new GetManageView(persistence.unitOfWork, clock);
}

describe('GetManageView', () => {
  it('shows the owner the list, its key and each item with what editing needs', async () => {
    const shown = await (await setup()).execute({ wishlistId: WISHLIST_ID }, OWNER);

    expect(shown).toEqual({
      title: 'Baby Shower', description: null, key: 'the-key',
      items: [
        { id: ITEM_ID, type: 'single', title: 'Stroller', quantity: 1, priceMinor: null, url: null, description: null, deletable: true, committedUnits: 0, pledgedMinor: null },
        { id: OTHER_ITEM_ID, type: 'single', title: 'Toaster', quantity: 1, priceMinor: null, url: null, description: null, deletable: false, committedUnits: 1, pledgedMinor: null },
      ],
    });
  });

  it('treats a caller who is not the owner as no list', async () => {
    await expect((await setup()).execute({ wishlistId: WISHLIST_ID }, GUEST)).rejects.toThrow(WishlistNotFoundError);
  });
});
