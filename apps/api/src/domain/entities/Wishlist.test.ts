import { describe, expect, it } from 'vitest';
import { Wishlist } from './Wishlist.js';
import { Item } from './Item.js';
import { Hold } from './Hold.js';
import {
  DomainValidationError, HoldLapsedError, HoldNotActiveError, HoldNotFoundError, ItemNotFoundError, ItemUnavailableError, NoPaymentMethodError,
} from '../errors.js';
import { PaymentMethods } from '../value-objects/PaymentMethods.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const OTHER_WISHLIST_ID = '99999999-9999-7999-8999-999999999999';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const OTHER_ITEM_ID = '44444444-4444-7444-8444-444444444444';
const SESSION = 'a'.repeat(64);
const OTHER_SESSION = 'b'.repeat(64);
const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const validProps = { id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key', asOf: T0 };
const tokens = (holdId = '55555555-5555-7555-8555-555555555555') => ({ generateEntityId: () => holdId, generateHoldSecret: () => 'hold-secret' });
const hasher = { hash: () => 'f'.repeat(64) };

function itemOf(wishlistId = WISHLIST_ID, overrides: { quantity?: number; seq?: number } = {}) {
  return Item.reconstitute({ id: ITEM_ID, wishlistId, type: 'single', title: 'Cot', quantity: 1, seq: 0, ...overrides });
}

let holdCount = 0;
function holdOn(itemId: string, overrides: Partial<Parameters<typeof Hold.reconstitute>[0]> = {}): Hold {
  holdCount += 1;
  return Hold.reconstitute({
    id: `00000000-0000-7000-8000-${String(holdCount).padStart(12, '0')}`, itemId, secret: 'hold-secret', sessionHash: SESSION,
    idempotencyKey: `idem-${holdCount}`, expiresAt: at(3 * DAY), extendedAt: null, releasedAt: null, purchasedAt: null,
    ...overrides,
  });
}

/** A wishlist loaded at `asOf` (T0 unless given), with its one item, the given holds and `purchasedCount` purchased ones. */
function loaded(options: { quantity?: number; seq?: number; purchasedCount?: number; holds?: Hold[]; asOf?: Date } = {}): Wishlist {
  const { holds = [], asOf = T0, purchasedCount = 0, ...itemOverrides } = options;
  const purchased = Array.from({ length: purchasedCount }, () => holdOn(ITEM_ID, { purchasedAt: T0 }));
  return Wishlist.reconstitute({
    ...validProps, asOf, keyGen: 1, items: [itemOf(WISHLIST_ID, itemOverrides)], holds: [...holds, ...purchased],
  });
}

describe('Wishlist.create', () => {
  it('creates a wishlist with keyGen starting at 1', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.id.value).toBe(WISHLIST_ID);
    expect(wishlist.slug.value).toBe('abc123');
    expect(wishlist.title).toBe('Baby Shower');
    expect(wishlist.keyGen).toBe(1);
  });

  it('wraps the bearer secrets in value objects', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.ownerToken.value).toBe('owner-tok');
    expect(wishlist.key.value).toBe('guest-key');
  });

  it('trims the title', () => {
    expect(Wishlist.create({ ...validProps, title: '  Baby Shower  ' }).title).toBe('Baby Shower');
  });

  it('rejects an empty or over-long title, an empty secret, or a bad id', () => {
    expect(() => Wishlist.create({ ...validProps, title: '   ' })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, ownerToken: '' })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, key: '' })).toThrow(DomainValidationError);
    expect(() => Wishlist.create({ ...validProps, id: 'w1' })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.reconstitute', () => {
  const persisted = { ...validProps, keyGen: 3 };

  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, title: '' })).toThrow(DomainValidationError);
    expect(() => Wishlist.reconstitute({ ...persisted, title: '   ' })).toThrow(DomainValidationError);
  });

  it('restores the persisted fields as value objects', () => {
    const wishlist = Wishlist.reconstitute(persisted);
    expect(wishlist.keyGen).toBe(3);
    expect(wishlist.ownerToken.value).toBe('owner-tok');
  });

  it('has no item when none was loaded', () => {
    expect(Wishlist.reconstitute(persisted).items).toEqual([]);
    expect(Wishlist.reconstitute(persisted).item).toBeNull();
  });

  it('attaches the loaded item, concurrency state and all', () => {
    const item = itemOf(WISHLIST_ID, { seq: 7 });
    const wishlist = Wishlist.reconstitute({ ...persisted, items: [item] });
    expect(wishlist.items).toEqual([item]);
    expect(wishlist.items[0].seq).toBe(7);
  });

  it('counts the loaded holds that are purchased, zero when there are none', () => {
    const item = itemOf();
    const holds = [holdOn(ITEM_ID, { purchasedAt: T0 }), holdOn(ITEM_ID, { purchasedAt: T0 }), holdOn(ITEM_ID)];
    expect(Wishlist.reconstitute({ ...persisted, items: [item], holds }).purchasedCountOf(ITEM_ID)).toBe(2);
    expect(Wishlist.reconstitute({ ...persisted, items: [item] }).purchasedCountOf(ITEM_ID)).toBe(0);
  });

  it('does not count a purchased hold as active', () => {
    const wishlist = loaded({ quantity: 2, holds: [holdOn(ITEM_ID, { purchasedAt: T0 })] });
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
    expect(wishlist.itemStatus(ITEM_ID)).toBe('available');
  });

  it('finds a purchased hold it loaded', () => {
    const hold = holdOn(ITEM_ID, { purchasedAt: T0 });
    expect(loaded({ holds: [hold] }).findHold(hold.id.value)).toBe(hold);
  });

  it('rejects an item that belongs to a different wishlist', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, items: [itemOf(OTHER_WISHLIST_ID)] })).toThrow(DomainValidationError);
  });

  it('carries the loaded holds, each reachable by id', () => {
    const hold = holdOn(ITEM_ID);
    expect(loaded({ holds: [hold] }).findHold(hold.id.value)).toBe(hold);
  });

  it('rejects a hold on an item outside this wishlist', () => {
    expect(() => loaded({ holds: [holdOn(OTHER_ITEM_ID)] })).toThrow(DomainValidationError);
  });

  it('keeps its own copy of the instant it was loaded at', () => {
    const asOf = at(3 * DAY);
    const wishlist = loaded({ holds: [holdOn(ITEM_ID)], asOf });
    asOf.setTime(at(3 * DAY + 1).getTime());
    expect(wishlist.itemStatus(ITEM_ID)).toBe('held');
  });
});

describe('Wishlist.addItem', () => {
  it('attaches an available item it minted the id for, owned by this wishlist', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ type: 'single', title: 'Cot' }, { generateEntityId: () => ITEM_ID });
    expect(wishlist.items).toEqual([item]);
    expect(item.id.value).toBe(ITEM_ID);
    expect(item.wishlistId.value).toBe(WISHLIST_ID);
    expect(wishlist.itemStatus(ITEM_ID)).toBe('available');
  });

  it('keeps the id and wishlist it assigned even if the caller passes its own', () => {
    const wishlist = Wishlist.create(validProps);
    const smuggled = { type: 'single' as const, title: 'Cot', id: OTHER_ITEM_ID, wishlistId: 'someone-else' };
    const item = wishlist.addItem(smuggled, { generateEntityId: () => ITEM_ID });
    expect([item.id.value, item.wishlistId.value]).toEqual([ITEM_ID, WISHLIST_ID]);
  });

  it('takes several items, each reachable by id', () => {
    const wishlist = Wishlist.create(validProps);
    const ids = [ITEM_ID, OTHER_ITEM_ID];
    let next = 0;
    for (const title of ['Stroller', 'Crib']) wishlist.addItem({ type: 'single', title }, { generateEntityId: () => ids[next++] });
    expect(wishlist.items.map((i) => i.title)).toEqual(['Stroller', 'Crib']);
    expect(wishlist.getItem(OTHER_ITEM_ID).title).toBe('Crib');
  });
});

describe('Wishlist group gifts', () => {
  const ids = { generateEntityId: () => ITEM_ID };
  it('refuses a group gift on a list with no payment method', () => {
    const wishlist = Wishlist.create(validProps);
    expect(() => wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, ids)).toThrow(NoPaymentMethodError);
  });
  it('accepts a group gift once the list has a payment method', () => {
    const wishlist = Wishlist.create({ ...validProps, paymentMethods: PaymentMethods.from({ venmoHandle: 'my-venmo' }) });
    expect(wishlist.addItem({ type: 'group', title: 'Mixer', priceMinor: 45000 }, ids).type).toBe('group');
  });
});

describe('Wishlist.getItem', () => {
  it('returns the attached item when the id matches', () => {
    const wishlist = loaded();
    expect(wishlist.getItem(ITEM_ID)).toBe(wishlist.items[0]);
  });

  it('throws ItemNotFoundError when no item is attached, or the id does not match', () => {
    expect(() => Wishlist.create(validProps).getItem(ITEM_ID)).toThrow(ItemNotFoundError);
    expect(() => loaded().getItem(OTHER_ITEM_ID)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.holdItem', () => {
  const props = { itemId: ITEM_ID, sessionHash: SESSION, idempotencyKey: 'idem-new', durationMs: 3 * DAY };

  it('places a hold on a free item and returns everything the caller must persist', () => {
    const wishlist = loaded({ seq: 4 });
    const { hold, item, event, expectedSeq } = wishlist.holdItem(props, tokens(), hasher);
    expect(hold.expiresAt).toEqual(at(3 * DAY));
    expect(event.occurredAt).toBe(T0.toISOString());
    expect(item).toBe(wishlist.getItem(ITEM_ID));
    expect(event.type).toBe('ItemHeld');
    expect(expectedSeq).toBe(4);
    expect(item.seq).toBe(5);
  });

  it('adds the hold to its snapshot, so the same aggregate refuses another hold on the last unit', () => {
    const wishlist = loaded();
    wishlist.holdItem(props, tokens(), hasher);
    expect(wishlist.itemStatus(ITEM_ID)).toBe('held');
    expect(() => wishlist.holdItem({ ...props, sessionHash: OTHER_SESSION, idempotencyKey: 'idem-2' }, tokens('66666666-6666-7666-8666-666666666666'), hasher))
      .toThrow(ItemUnavailableError);
  });

  it('refuses when a loaded active hold covers the unit', () => {
    expect(() => loaded({ holds: [holdOn(ITEM_ID)] }).holdItem(props, tokens(), hasher)).toThrow(ItemUnavailableError);
  });

  it('re-checks each loaded hold at the instant it was loaded at: one already lapsed frees its unit', () => {
    const lapsed = holdOn(ITEM_ID, { expiresAt: at(-1) });
    expect(() => loaded({ holds: [lapsed] }).holdItem(props, tokens(), hasher)).not.toThrow();
  });

  it('throws ItemNotFoundError for an item not on this list', () => {
    expect(() => loaded().holdItem({ ...props, itemId: OTHER_ITEM_ID }, tokens(), hasher)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.findHold and owns', () => {
  it('findHold returns the snapshot instance itself, or null', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ holds: [hold] });
    expect(wishlist.findHold(hold.id.value)).toBe(hold);
    expect(wishlist.findHold('00000000-0000-7000-8000-999999999999')).toBeNull();
  });

  it("owns a hold on its own item, not one on another list's item", () => {
    expect(loaded().owns(holdOn(ITEM_ID))).toBe(true);
    expect(loaded().owns(holdOn(OTHER_ITEM_ID))).toBe(false);
  });
});

describe('Wishlist.extendHold and releaseHold', () => {
  it('extendHold extends the hold and records one event on the item stream', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ seq: 1, holds: [hold], asOf: at(DAY) });
    const { event, item, expectedSeq } = wishlist.extendHold(hold, 3 * DAY);
    expect(event.type).toBe('HoldExtended');
    expect(hold.extendedAt).toEqual(at(DAY));
    expect(expectedSeq).toBe(1);
    expect(item.seq).toBe(2);
    expect(hold.expiresAt).toEqual(at(6 * DAY));
  });

  it('releaseHold frees the unit within the same aggregate', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ holds: [hold], asOf: at(DAY) });
    wishlist.releaseHold(hold);
    expect(hold.releasedAt).toEqual(at(DAY));
    expect(wishlist.itemStatus(ITEM_ID)).toBe('available');
  });

  it("refuses a hold on another list's item with HoldNotFoundError", () => {
    expect(() => loaded().releaseHold(holdOn(OTHER_ITEM_ID))).toThrow(HoldNotFoundError);
    expect(() => loaded().extendHold(holdOn(OTHER_ITEM_ID), DAY)).toThrow(HoldNotFoundError);
  });

  it('does not advance seq when the hold refuses the command', () => {
    const wishlist = loaded();
    expect(() => wishlist.extendHold(holdOn(ITEM_ID, { releasedAt: T0 }), DAY)).toThrow(HoldNotActiveError);
    expect(wishlist.getItem(ITEM_ID).seq).toBe(0);
  });
});

describe('Wishlist.purchaseHold', () => {
  it('purchases an active hold; the unit is gone for good', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ holds: [hold], asOf: at(DAY) });
    const { event, item } = wishlist.purchaseHold(hold);
    expect(event.type).toBe('ItemPurchased');
    expect(hold.purchasedAt).toEqual(at(DAY));
    expect(item.seq).toBe(1);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
    expect(wishlist.itemStatus(ITEM_ID)).toBe('purchased');
  });

  it('counts the purchase for the rest of the command: a later decision sees the unit as gone', () => {
    const first = holdOn(ITEM_ID);
    const lapsed = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ quantity: 2, holds: [first] });
    wishlist.purchaseHold(first);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
    expect(wishlist.canPurchaseHold(lapsed)).toBe(true);
    wishlist.purchaseHold(lapsed);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(2);
    expect(wishlist.canPurchaseHold(holdOn(ITEM_ID, { expiresAt: at(-1) }))).toBe(false);
  });

  it('adds to the purchased holds it was loaded with', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ quantity: 3, purchasedCount: 1, holds: [hold] });
    wishlist.purchaseHold(hold);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(2);
    expect(wishlist.itemStatus(ITEM_ID)).toBe('available');
  });

  it('counts an expired hold purchased from outside the load, once', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ quantity: 2 });
    wishlist.purchaseHold(expired);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
    expect(wishlist.findHold(expired.id.value)).toBe(expired);
  });

  it('does not count a hold twice when it was loaded and is then purchased', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ holds: [hold] });
    wishlist.purchaseHold(hold);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
  });

  it('purchases an expired hold while a unit is still free', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    expect(loaded().purchaseHold(expired).event.type).toBe('ItemPurchased');
  });

  it('refuses an expired hold once someone else holds the last unit, and records nothing', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ holds: [holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(() => wishlist.purchaseHold(expired)).toThrow(HoldLapsedError);
    expect(() => wishlist.purchaseHold(expired)).toThrow(ItemUnavailableError); // same 409 code, a clearer message
    expect(expired.purchasedAt).toBeNull();
    expect(wishlist.getItem(ITEM_ID).seq).toBe(0);
  });

  it('refuses a released hold', () => {
    expect(() => loaded().purchaseHold(holdOn(ITEM_ID, { releasedAt: T0 }))).toThrow(HoldNotActiveError);
  });

  it('refuses a hold that is already purchased', () => {
    expect(() => loaded().purchaseHold(holdOn(ITEM_ID, { purchasedAt: T0 }))).toThrow(HoldNotActiveError);
  });
});

describe('Wishlist.canPurchaseHold', () => {
  it('is true for an active hold, and for an expired one while a unit is free', () => {
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID))).toBe(true);
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { expiresAt: at(-1) }))).toBe(true);
  });

  it('is false for an expired hold whose unit someone else now holds', () => {
    const wishlist = loaded({ holds: [holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(wishlist.canPurchaseHold(holdOn(ITEM_ID, { expiresAt: at(-1) }))).toBe(false);
  });

  it("is false for a released or purchased hold, or another list's", () => {
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { releasedAt: T0 }))).toBe(false);
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { purchasedAt: T0 }))).toBe(false);
    expect(loaded().canPurchaseHold(holdOn(OTHER_ITEM_ID))).toBe(false);
  });
});

describe('Wishlist.holdStatus, canExtendHold and canReleaseHold', () => {
  it('reports a hold\'s status as of the instant the aggregate was loaded at', () => {
    const hold = holdOn(ITEM_ID);
    expect(loaded({ holds: [hold], asOf: at(3 * DAY) }).holdStatus(hold)).toBe('active');
    expect(loaded({ holds: [hold], asOf: at(3 * DAY + 1) }).holdStatus(hold)).toBe('expired');
  });

  it('reports the status of a hold that was not loaded, as long as it is on this list', () => {
    expect(loaded().holdStatus(holdOn(ITEM_ID, { releasedAt: T0 }))).toBe('released');
  });

  it("refuses to report the status of a hold on another list's item", () => {
    expect(() => loaded().holdStatus(holdOn(OTHER_ITEM_ID))).toThrow(HoldNotFoundError);
  });

  it('canExtendHold: active and never extended, on this list', () => {
    expect(loaded().canExtendHold(holdOn(ITEM_ID))).toBe(true);
    expect(loaded().canExtendHold(holdOn(ITEM_ID, { extendedAt: T0 }))).toBe(false);
    expect(loaded({ asOf: at(3 * DAY + 1) }).canExtendHold(holdOn(ITEM_ID))).toBe(false);
    expect(loaded().canExtendHold(holdOn(OTHER_ITEM_ID))).toBe(false);
  });

  it('canReleaseHold: active, extended or not, on this list', () => {
    expect(loaded().canReleaseHold(holdOn(ITEM_ID, { extendedAt: T0 }))).toBe(true);
    expect(loaded().canReleaseHold(holdOn(ITEM_ID, { purchasedAt: T0 }))).toBe(false);
    expect(loaded({ asOf: at(3 * DAY + 1) }).canReleaseHold(holdOn(ITEM_ID))).toBe(false);
    expect(loaded().canReleaseHold(holdOn(OTHER_ITEM_ID))).toBe(false);
  });
});

describe('Wishlist.itemStatus — lazy expiry', () => {
  it('decides availability per item: a hold on one leaves the other available', () => {
    const second = Item.reconstitute({ id: OTHER_ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Crib', quantity: 1, seq: 0 });
    const wishlist = Wishlist.reconstitute({ ...validProps, keyGen: 1, items: [itemOf(), second], holds: [holdOn(ITEM_ID)] });
    expect(wishlist.itemStatus(ITEM_ID)).toBe('held');
    expect(wishlist.itemStatus(OTHER_ITEM_ID)).toBe('available');
  });

  it('is held up to and including the instant the hold expires, available 1 ms later', () => {
    const hold = holdOn(ITEM_ID);
    expect(loaded({ holds: [hold], asOf: at(3 * DAY) }).itemStatus(ITEM_ID)).toBe('held');
    expect(loaded({ holds: [hold], asOf: at(3 * DAY + 1) }).itemStatus(ITEM_ID)).toBe('available');
  });

  it('is purchased once purchases cover the quantity', () => {
    expect(loaded({ purchasedCount: 1 }).itemStatus(ITEM_ID)).toBe('purchased');
  });
});
