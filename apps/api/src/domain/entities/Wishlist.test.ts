import { describe, expect, it } from 'vitest';
import { Wishlist } from './Wishlist.js';
import { Item } from './Item.js';
import { Hold } from './Hold.js';
import {
  DomainValidationError, HoldNotActiveError, HoldNotFoundError, ItemNotFoundError, ItemUnavailableError,
} from '../errors.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const OTHER_WISHLIST_ID = '99999999-9999-7999-8999-999999999999';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const OTHER_ITEM_ID = '44444444-4444-7444-8444-444444444444';
const SESSION = 'a'.repeat(64);
const OTHER_SESSION = 'b'.repeat(64);
const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const validProps = { id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };
const tokens = (holdId = '55555555-5555-7555-8555-555555555555') => ({ generateEntityId: () => holdId, generateHoldSecret: () => 'hold-secret' });
const hasher = { hash: () => 'f'.repeat(64) };

function itemOf(wishlistId = WISHLIST_ID, overrides: { quantity?: number; seq?: number; purchasedCount?: number } = {}) {
  return Item.reconstitute({ id: ITEM_ID, wishlistId, type: 'single', title: 'Cot', quantity: 1, seq: 0, purchasedCount: 0, ...overrides });
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

function loaded(options: { quantity?: number; seq?: number; purchasedCount?: number; activeHolds?: Hold[] } = {}): Wishlist {
  const { activeHolds = [], ...itemOverrides } = options;
  return Wishlist.reconstitute({ ...validProps, keyGen: 1, item: itemOf(WISHLIST_ID, itemOverrides), activeHolds });
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
    expect(Wishlist.reconstitute(persisted).item).toBeNull();
  });

  it('attaches the loaded item, concurrency state and all', () => {
    const item = itemOf(WISHLIST_ID, { seq: 7 });
    const wishlist = Wishlist.reconstitute({ ...persisted, item });
    expect(wishlist.item).toBe(item);
    expect(wishlist.item?.seq).toBe(7);
  });

  it('rejects an item that belongs to a different wishlist', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, item: itemOf(OTHER_WISHLIST_ID) })).toThrow(DomainValidationError);
  });

  it('carries the loaded active holds, each reachable by id', () => {
    const hold = holdOn(ITEM_ID);
    expect(loaded({ activeHolds: [hold] }).findHold(hold.id.value)).toBe(hold);
  });

  it('rejects a hold on an item outside this wishlist', () => {
    expect(() => loaded({ activeHolds: [holdOn(OTHER_ITEM_ID)] })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.addItem', () => {
  it('attaches an available item it minted the id for, owned by this wishlist', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateEntityId: () => ITEM_ID });
    expect(wishlist.item).toBe(item);
    expect(item.id.value).toBe(ITEM_ID);
    expect(item.wishlistId.value).toBe(WISHLIST_ID);
    expect(wishlist.itemStatusAt(ITEM_ID, T0)).toBe('available');
  });

  it('throws when a second item is added — a list holds a single item', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem({ title: 'Cot' }, { generateEntityId: () => ITEM_ID });
    expect(() => wishlist.addItem({ title: 'Pram' }, { generateEntityId: () => OTHER_ITEM_ID })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.getItem', () => {
  it('returns the attached item when the id matches', () => {
    const wishlist = loaded();
    expect(wishlist.getItem(ITEM_ID)).toBe(wishlist.item);
  });

  it('throws ItemNotFoundError when no item is attached, or the id does not match', () => {
    expect(() => Wishlist.create(validProps).getItem(ITEM_ID)).toThrow(ItemNotFoundError);
    expect(() => loaded().getItem(OTHER_ITEM_ID)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.holdItem', () => {
  const props = { itemId: ITEM_ID, sessionHash: SESSION, idempotencyKey: 'idem-new', at: T0, durationMs: 3 * DAY };

  it('places a hold on a free item and returns everything the caller must persist', () => {
    const wishlist = loaded({ seq: 4 });
    const { hold, item, event, expectedSeq } = wishlist.holdItem(props, tokens(), hasher);
    expect(hold.expiresAt).toEqual(at(3 * DAY));
    expect(item).toBe(wishlist.getItem(ITEM_ID));
    expect(event.type).toBe('ItemHeld');
    expect(expectedSeq).toBe(4);
    expect(item.seq).toBe(5);
  });

  it('adds the hold to its snapshot, so the same aggregate refuses another hold on the last unit', () => {
    const wishlist = loaded();
    wishlist.holdItem(props, tokens(), hasher);
    expect(wishlist.itemStatusAt(ITEM_ID, T0)).toBe('held');
    expect(() => wishlist.holdItem({ ...props, sessionHash: OTHER_SESSION, idempotencyKey: 'idem-2' }, tokens('66666666-6666-7666-8666-666666666666'), hasher))
      .toThrow(ItemUnavailableError);
  });

  it('refuses when a loaded active hold covers the unit', () => {
    expect(() => loaded({ activeHolds: [holdOn(ITEM_ID)] }).holdItem(props, tokens(), hasher)).toThrow(ItemUnavailableError);
  });

  it('re-checks each loaded hold at the given instant: one that lapsed since loading frees its unit', () => {
    const lapsed = holdOn(ITEM_ID, { expiresAt: at(-1) });
    expect(() => loaded({ activeHolds: [lapsed] }).holdItem(props, tokens(), hasher)).not.toThrow();
  });

  it('throws ItemNotFoundError for an item not on this list', () => {
    expect(() => loaded().holdItem({ ...props, itemId: OTHER_ITEM_ID }, tokens(), hasher)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.findHold and owns', () => {
  it('findHold returns the snapshot instance itself, or null', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ activeHolds: [hold] });
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
    const wishlist = loaded({ seq: 1, activeHolds: [hold] });
    const { event, item, expectedSeq } = wishlist.extendHold(hold, at(DAY), 3 * DAY);
    expect(event.type).toBe('HoldExtended');
    expect(expectedSeq).toBe(1);
    expect(item.seq).toBe(2);
    expect(hold.expiresAt).toEqual(at(6 * DAY));
  });

  it('releaseHold frees the unit within the same aggregate', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ activeHolds: [hold] });
    wishlist.releaseHold(hold, at(DAY));
    expect(wishlist.itemStatusAt(ITEM_ID, at(DAY))).toBe('available');
  });

  it("refuses a hold on another list's item with HoldNotFoundError", () => {
    expect(() => loaded().releaseHold(holdOn(OTHER_ITEM_ID), T0)).toThrow(HoldNotFoundError);
    expect(() => loaded().extendHold(holdOn(OTHER_ITEM_ID), T0, DAY)).toThrow(HoldNotFoundError);
  });

  it('does not advance seq when the hold refuses the command', () => {
    const wishlist = loaded();
    expect(() => wishlist.extendHold(holdOn(ITEM_ID, { releasedAt: T0 }), T0, DAY)).toThrow(HoldNotActiveError);
    expect(wishlist.getItem(ITEM_ID).seq).toBe(0);
  });
});

describe('Wishlist.purchaseHold', () => {
  it('purchases an active hold; the unit is gone for good', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ activeHolds: [hold] });
    const { event, item } = wishlist.purchaseHold(hold, at(DAY));
    expect(event.type).toBe('ItemPurchased');
    expect(item.purchasedCount).toBe(1);
    expect(wishlist.itemStatusAt(ITEM_ID, at(DAY))).toBe('purchased');
  });

  it('purchases an expired hold while a unit is still free', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    expect(loaded().purchaseHold(expired, T0).event.type).toBe('ItemPurchased');
  });

  it('refuses an expired hold once someone else holds the last unit, and records nothing', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ activeHolds: [holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(() => wishlist.purchaseHold(expired, T0)).toThrow(ItemUnavailableError);
    expect(expired.purchasedAt).toBeNull();
    expect(wishlist.getItem(ITEM_ID).seq).toBe(0);
  });

  it('refuses a released hold', () => {
    expect(() => loaded().purchaseHold(holdOn(ITEM_ID, { releasedAt: T0 }), T0)).toThrow(HoldNotActiveError);
  });
});

describe('Wishlist.canPurchaseHold', () => {
  it('is true for an active hold, and for an expired one while a unit is free', () => {
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID), T0)).toBe(true);
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { expiresAt: at(-1) }), T0)).toBe(true);
  });

  it('is false for an expired hold whose unit someone else now holds', () => {
    const wishlist = loaded({ activeHolds: [holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(wishlist.canPurchaseHold(holdOn(ITEM_ID, { expiresAt: at(-1) }), T0)).toBe(false);
  });

  it("is false for a released or purchased hold, or another list's", () => {
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { releasedAt: T0 }), T0)).toBe(false);
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID, { purchasedAt: T0 }), T0)).toBe(false);
    expect(loaded().canPurchaseHold(holdOn(OTHER_ITEM_ID), T0)).toBe(false);
  });
});

describe('Wishlist.itemStatusAt — lazy expiry', () => {
  it('is held up to and including the instant the hold expires, available 1 ms later', () => {
    const wishlist = loaded({ activeHolds: [holdOn(ITEM_ID)] });
    expect(wishlist.itemStatusAt(ITEM_ID, at(3 * DAY))).toBe('held');
    expect(wishlist.itemStatusAt(ITEM_ID, at(3 * DAY + 1))).toBe('available');
  });

  it('is purchased once purchases cover the quantity', () => {
    expect(loaded({ purchasedCount: 1 }).itemStatusAt(ITEM_ID, T0)).toBe('purchased');
  });
});
