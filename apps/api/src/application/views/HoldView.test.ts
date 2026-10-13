import { describe, expect, it } from 'vitest';
import { toHoldView } from './HoldView.js';
import { Hold } from '../../domain/entities/Hold.js';
import { Item } from '../../domain/entities/Item.js';
import { Wishlist } from '../../domain/entities/Wishlist.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

let count = 0;
function holdOn(overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}): Hold {
  count += 1;
  return Hold.reconstitute({
    id: `00000000-0000-7000-8000-${String(count).padStart(12, '0')}`, itemId: ITEM_ID, secret: 's', sessionHash: 'a'.repeat(64),
    idempotencyKey: `idem-${count}`, expiresAt: at(3 * DAY), extendedAt: null, releasedAt: null, purchasedAt: null, ...overrides,
  });
}

/** The list as loaded at `asOf`, carrying `holds`. */
function wishlistAt(asOf: Date, holds: Hold[] = []): Wishlist {
  const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 0 });
  return Wishlist.reconstitute({ id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'o', key: 'k', keyGen: 1, asOf, items: [item], holds });
}

// The rules behind status and actions are the wishlist's, tested in Wishlist.test.ts;
// this only checks that the view carries what the wishlist answers.
describe('toHoldView', () => {
  it("maps the hold's fields and the wishlist's answers into the view", () => {
    const hold = holdOn({ extendedAt: at(DAY) });
    expect(toHoldView(wishlistAt(at(DAY), [hold]), hold)).toEqual({
      holdId: hold.id.value, itemId: ITEM_ID, status: 'active',
      expiresAt: at(3 * DAY).toISOString(), extendedAt: at(DAY).toISOString(),
      actions: { extend: false, release: true, purchase: true },
    });
  });
});
