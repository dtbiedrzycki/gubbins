import { describe, expect, it } from 'vitest';
import { GetContributions } from './GetContributions.js';
import { BuyItem } from './BuyItem.js';
import { HoldItem } from './HoldItem.js';
import { MarkHoldPurchased } from './MarkHoldPurchased.js';
import { PledgeContribution } from './PledgeContribution.js';
import { Hold } from '../../domain/entities/Hold.js';
import { PaymentMethods } from '../../domain/value-objects/PaymentMethods.js';
import { aWishlist } from '../test-fakes/builders.js';
import { inMemoryPersistence } from '../test-fakes/InMemoryRepositories.js';
import { SequentialTokenGenerator } from '../test-fakes/SequentialTokenGenerator.js';
import { FakeHasher } from '../test-fakes/FakeHasher.js';
import { FixedClock } from '../test-fakes/FixedClock.js';
import { DAY, GUEST, ITEM_ID, OTHER_ITEM_ID, T0, WISHLIST_ID } from '../test-fakes/scenarios.js';
import { WishlistNotFoundError } from '../../domain/errors.js';

const GROUP_ITEM_ID = '55555555-5555-7555-8555-555555555555';
const OWNER = { guestSession: null, owner: true };
const MINUTE = 60 * 1000;

async function setup() {
  const persistence = inMemoryPersistence();
  const clock = new FixedClock(T0);
  const wishlist = aWishlist().withId(WISHLIST_ID).withPaymentMethods(PaymentMethods.from({ venmoHandle: 'my-venmo' }))
    .withItem({ id: ITEM_ID, title: 'Paperbacks', quantity: 3 }).withItem({ id: OTHER_ITEM_ID, title: 'Apron' }).build();
  wishlist.addItem({ type: 'group', title: 'Bench', priceMinor: 18_000 }, { generateEntityId: () => GROUP_ITEM_ID });
  await persistence.wishlists.insert(wishlist);
  const tokens = new SequentialTokenGenerator();
  const policy = { durationDays: 3 };
  return {
    persistence, clock,
    hold: (name: string, units = 1) => new HoldItem(persistence.unitOfWork, tokens, clock, new FakeHasher(), policy)
      .execute({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, idempotencyKey: `hold-${name}`, name, units }, GUEST),
    buy: (name: string, message: string) => new BuyItem(persistence.unitOfWork, tokens, clock, new FakeHasher(), policy)
      .execute({ wishlistId: WISHLIST_ID, itemId: ITEM_ID, idempotencyKey: `buy-${name}`, name, units: 1, message }, GUEST),
    markPurchased: (holdId: string, units = 1) => new MarkHoldPurchased(persistence.unitOfWork, clock)
      .execute({ wishlistId: WISHLIST_ID, holdId, units }, GUEST),
    pledge: (name: string, amountMinor: number, message: string) => new PledgeContribution(persistence.unitOfWork, tokens, clock)
      .execute({ wishlistId: WISHLIST_ID, itemId: GROUP_ITEM_ID, idempotencyKey: `pledge-${name}`, amountMinor, name, message }, GUEST),
    contributions: (access: { guestSession: null; owner: true } | typeof GUEST = OWNER) =>
      new GetContributions(persistence.unitOfWork, clock).execute({ wishlistId: WISHLIST_ID }, access),
  };
}

const forItem = (contributions: Awaited<ReturnType<GetContributions['execute']>>, itemId: string) => contributions.items.find((i) => i.itemId === itemId);

describe('GetContributions', () => {
  it('shows the owner who bought, holds and pledged each gift, with their messages', async () => {
    const s = await setup();
    await s.buy('Ada', 'Happy 30th!');
    await s.hold('Grace');
    await s.pledge('Sam', 2_500, 'From all of us');

    expect(await s.contributions()).toEqual({
      items: [
        { itemId: GROUP_ITEM_ID, purchases: [], holds: [], pledges: [{ name: 'Sam', message: 'From all of us', amountMinor: 2_500, pledgedAt: T0 }] },
        { itemId: ITEM_ID, purchases: [{ name: 'Ada', message: 'Happy 30th!', units: 1, purchasedAt: T0 }],
          holds: [{ name: 'Grace', units: 1, expiresAt: new Date(T0.getTime() + 3 * DAY) }], pledges: [] },
        { itemId: OTHER_ITEM_ID, purchases: [], holds: [], pledges: [] },
      ],
    });
  });

  it('lists purchases in the order they were bought, not the order they were held', async () => {
    const s = await setup();
    const grace = await s.hold('Grace');
    s.clock.advance(MINUTE);
    const ada = await s.hold('Ada');
    s.clock.advance(MINUTE);
    await s.markPurchased(ada.holdId);
    s.clock.advance(MINUTE);
    await s.markPurchased(grace.holdId);

    expect(forItem(await s.contributions(), ITEM_ID)!.purchases.map((p) => p.name)).toEqual(['Ada', 'Grace']);
  });

  it('lists a part-bought hold with the units bought, not the units held', async () => {
    const s = await setup();
    const ada = await s.hold('Ada', 2);
    await s.markPurchased(ada.holdId, 1);

    const shown = forItem(await s.contributions(), ITEM_ID)!;
    expect(shown.purchases.map((p) => p.units)).toEqual([1]);
    expect(shown.holds).toEqual([]);
  });

  it('treats a caller who is not the owner as no list', async () => {
    await expect((await setup()).contributions(GUEST)).rejects.toThrow(WishlistNotFoundError);
  });

  it('refuses a hold whose guest details are missing', async () => {
    const s = await setup();
    const holdId = '66666666-6666-7666-8666-666666666666';
    s.persistence.store.holds.set(holdId, Hold.reconstitute({
      id: holdId, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: 'a'.repeat(64), idempotencyKey: 'old-hold', piiRef: null,
      expiresAt: new Date(T0.getTime() + DAY), extendedAt: null, releasedAt: null, purchasedAt: null, buyUndoneAt: null, units: 1, purchasedUnits: null,
    }));

    await expect(s.contributions()).rejects.toThrow(`guest details missing for hold ${holdId}`);
  });
});
