import { describe, expect, it } from 'vitest';
import { Wishlist } from './Wishlist.js';
import { Item } from './Item.js';
import { Hold } from './Hold.js';
import { Contribution } from './Contribution.js';
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

function itemOf(wishlistId = WISHLIST_ID, overrides: { quantity?: number; seq?: number; holds?: Hold[]; asOf?: Date } = {}) {
  return Item.reconstitute({ id: ITEM_ID, wishlistId, type: 'single', title: 'Cot', quantity: 1, seq: 0, asOf: T0, ...overrides });
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

/** A wishlist loaded at `asOf` (T0 unless given), with its one item holding the given holds and `purchasedCount` purchased ones. */
function loaded(options: { quantity?: number; seq?: number; purchasedCount?: number; holds?: Hold[]; asOf?: Date } = {}): Wishlist {
  const { holds = [], asOf = T0, purchasedCount = 0, ...itemOverrides } = options;
  const purchased = Array.from({ length: purchasedCount }, () => holdOn(ITEM_ID, { purchasedAt: T0 }));
  const item = itemOf(WISHLIST_ID, { ...itemOverrides, asOf, holds: [...holds, ...purchased] });
  return Wishlist.reconstitute({ ...validProps, asOf, keyGen: 1, items: [item] });
}

/** Every `can…` answer for `hold`, asked of a wishlist that loaded it. */
function asks(hold: Hold, options: Parameters<typeof loaded>[0] = {}) {
  const wishlist = loaded({ ...options, holds: [hold] });
  return { canExtendHold: wishlist.canExtendHold(hold), canReleaseHold: wishlist.canReleaseHold(hold), canPurchaseHold: wishlist.canPurchaseHold(hold) };
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

  it('has no items when none were loaded', () => {
    expect(Wishlist.reconstitute(persisted).items).toEqual([]);
  });

  it('attaches the loaded item, concurrency state and all', () => {
    const item = itemOf(WISHLIST_ID, { seq: 7 });
    const wishlist = Wishlist.reconstitute({ ...persisted, items: [item] });
    expect(wishlist.items).toEqual([item]);
    expect(wishlist.items[0].seq).toBe(7);
  });

  it('rejects an item that belongs to a different wishlist', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, items: [itemOf(OTHER_WISHLIST_ID)] })).toThrow(DomainValidationError);
  });

  it('rejects an item loaded at a different instant from the wishlist', () => {
    const item = itemOf(WISHLIST_ID, { asOf: at(1) });
    expect(() => Wishlist.reconstitute({ ...validProps, keyGen: 1, items: [item] })).toThrow(DomainValidationError);
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

describe('Wishlist.availableUnitsOf', () => {
  it('throws ItemNotFoundError for an item the list does not own', () => {
    expect(() => loaded().availableUnitsOf(OTHER_ITEM_ID)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.holdItem', () => {
  const props = { itemId: ITEM_ID, sessionHash: SESSION, idempotencyKey: 'idem-new', durationMs: 3 * DAY, piiRef: '66666666-6666-7666-8666-666666666666' };

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

  it('throws ItemNotFoundError for an item not on this list', () => {
    expect(() => loaded().holdItem({ ...props, itemId: OTHER_ITEM_ID }, tokens(), hasher)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.findHold and owns', () => {
  it('findHold returns its own instance of a hold it loaded, whatever its state, and null for an id it did not load', () => {
    const holds = [holdOn(ITEM_ID), holdOn(ITEM_ID, { expiresAt: at(-1) }), holdOn(ITEM_ID, { releasedAt: T0 }), holdOn(ITEM_ID, { purchasedAt: T0 })];
    const wishlist = loaded({ quantity: 2, holds });
    for (const hold of holds) expect(wishlist.findHold(hold.id.value)).toBe(hold);
    expect(wishlist.findHold(holdOn(ITEM_ID).id.value)).toBeNull();
  });

  it("owns a hold it loaded, not one it did not load, on its own item or another list's", () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ holds: [hold] });
    expect(wishlist.owns(hold)).toBe(true);
    expect(wishlist.owns(holdOn(ITEM_ID))).toBe(false);
    expect(wishlist.owns(holdOn(OTHER_ITEM_ID))).toBe(false);
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

  it('refuses a command on a hold it did not load, with HoldNotFoundError', () => {
    const wishlist = loaded();
    expect(() => wishlist.releaseHold(holdOn(ITEM_ID))).toThrow(HoldNotFoundError);
  });

  it('does not advance seq when the hold refuses the command', () => {
    const released = holdOn(ITEM_ID, { releasedAt: T0 });
    const wishlist = loaded({ holds: [released] });
    expect(() => wishlist.extendHold(released, DAY)).toThrow(HoldNotActiveError);
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
    const alsoLapsed = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ quantity: 2, holds: [first, lapsed, alsoLapsed] });
    wishlist.purchaseHold(first);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
    expect(wishlist.canPurchaseHold(lapsed)).toBe(true);
    wishlist.purchaseHold(lapsed);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(2);
    expect(wishlist.canPurchaseHold(alsoLapsed)).toBe(false);
  });

  it('adds to the purchased holds it was loaded with', () => {
    const hold = holdOn(ITEM_ID);
    const wishlist = loaded({ quantity: 3, purchasedCount: 1, holds: [hold] });
    wishlist.purchaseHold(hold);
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(2);
    expect(wishlist.itemStatus(ITEM_ID)).toBe('available');
  });

  it('acts on its own instance of a hold passed as a copy, and counts a purchase once', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ quantity: 2, holds: [expired] });
    const copy = Hold.reconstitute({
      id: expired.id.value, itemId: ITEM_ID, secret: 'hold-secret', sessionHash: SESSION, idempotencyKey: expired.idempotencyKey.value,
      expiresAt: expired.expiresAt, extendedAt: null, releasedAt: null, purchasedAt: null,
    });

    const { hold } = wishlist.purchaseHold(copy);

    expect(hold).toBe(wishlist.findHold(expired.id.value));
    expect(wishlist.purchasedCountOf(ITEM_ID)).toBe(1);
  });

  it('purchases an expired hold while a unit is still free', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    expect(loaded({ holds: [expired] }).purchaseHold(expired).event.type).toBe('ItemPurchased');
  });

  it('refuses an expired hold once someone else holds the last unit, and records nothing', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ holds: [expired, holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(() => wishlist.purchaseHold(expired)).toThrow(HoldLapsedError);
    expect(() => wishlist.purchaseHold(expired)).toThrow(ItemUnavailableError); // same 409 code, a clearer message
    expect(expired.purchasedAt).toBeNull();
    expect(wishlist.getItem(ITEM_ID).seq).toBe(0);
  });

  it('refuses a released hold', () => {
    const released = holdOn(ITEM_ID, { releasedAt: T0 });
    expect(() => loaded({ holds: [released] }).purchaseHold(released)).toThrow(HoldNotActiveError);
  });

  it('refuses a hold that is already purchased', () => {
    const purchased = holdOn(ITEM_ID, { purchasedAt: T0 });
    expect(() => loaded({ quantity: 2, holds: [purchased] }).purchaseHold(purchased)).toThrow(HoldNotActiveError);
  });
});

describe('Wishlist.canPurchaseHold', () => {
  it('is true for an active hold, and for an expired one while a unit is free', () => {
    expect(asks(holdOn(ITEM_ID)).canPurchaseHold).toBe(true);
    expect(asks(holdOn(ITEM_ID, { expiresAt: at(-1) })).canPurchaseHold).toBe(true);
  });

  it('is false for an expired hold whose unit someone else now holds', () => {
    const expired = holdOn(ITEM_ID, { expiresAt: at(-1) });
    const wishlist = loaded({ holds: [expired, holdOn(ITEM_ID, { sessionHash: OTHER_SESSION })] });
    expect(wishlist.canPurchaseHold(expired)).toBe(false);
  });

  it('is false for a released or purchased hold, or one it did not load', () => {
    expect(asks(holdOn(ITEM_ID, { releasedAt: T0 })).canPurchaseHold).toBe(false);
    expect(asks(holdOn(ITEM_ID, { purchasedAt: T0 })).canPurchaseHold).toBe(false);
    expect(loaded().canPurchaseHold(holdOn(ITEM_ID))).toBe(false);
  });
});

describe('Wishlist.holdStatus, canExtendHold and canReleaseHold', () => {
  it('reports a hold\'s status as of the instant the aggregate was loaded at', () => {
    const hold = holdOn(ITEM_ID);
    expect(loaded({ holds: [hold], asOf: at(3 * DAY) }).holdStatus(hold)).toBe('active');
    expect(loaded({ holds: [hold], asOf: at(3 * DAY + 1) }).holdStatus(hold)).toBe('expired');
  });

  it('reports the status of a released hold it loaded', () => {
    const released = holdOn(ITEM_ID, { releasedAt: T0 });
    expect(loaded({ holds: [released] }).holdStatus(released)).toBe('released');
  });

  it("refuses to report the status of a hold it did not load, or one on another list's item", () => {
    expect(() => loaded().holdStatus(holdOn(ITEM_ID))).toThrow(HoldNotFoundError);
    expect(() => loaded().holdStatus(holdOn(OTHER_ITEM_ID))).toThrow(HoldNotFoundError);
  });

  it('canExtendHold: active and never extended, and loaded', () => {
    expect(asks(holdOn(ITEM_ID)).canExtendHold).toBe(true);
    expect(asks(holdOn(ITEM_ID, { extendedAt: T0 })).canExtendHold).toBe(false);
    expect(asks(holdOn(ITEM_ID), { asOf: at(3 * DAY + 1) }).canExtendHold).toBe(false);
    expect(loaded().canExtendHold(holdOn(ITEM_ID))).toBe(false);
  });

  it('canReleaseHold: active, extended or not, and loaded', () => {
    expect(asks(holdOn(ITEM_ID, { extendedAt: T0 })).canReleaseHold).toBe(true);
    expect(asks(holdOn(ITEM_ID, { purchasedAt: T0 })).canReleaseHold).toBe(false);
    expect(asks(holdOn(ITEM_ID), { asOf: at(3 * DAY + 1) }).canReleaseHold).toBe(false);
    expect(loaded().canReleaseHold(holdOn(ITEM_ID))).toBe(false);
  });
});

describe('Wishlist.itemStatus', () => {
  it('decides availability per item: a hold on one leaves the other available', () => {
    const second = Item.reconstitute({ id: OTHER_ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Crib', quantity: 1, seq: 0, asOf: T0 });
    const wishlist = Wishlist.reconstitute({ ...validProps, keyGen: 1, items: [itemOf(WISHLIST_ID, { holds: [holdOn(ITEM_ID)] }), second] });
    expect(wishlist.itemStatus(ITEM_ID)).toBe('held');
    expect(wishlist.itemStatus(OTHER_ITEM_ID)).toBe('available');
  });
});

describe('Wishlist.replayHold', () => {
  it("returns the session's own hold for a key it already used, even once that hold has expired", () => {
    const hold = holdOn(ITEM_ID, { idempotencyKey: 'tap-1', expiresAt: at(-1) });
    expect(loaded({ holds: [hold] }).replayHold(ITEM_ID, 'tap-1', SESSION)).toBe(hold);
  });

  it("refuses another session's key with ItemUnavailableError", () => {
    const hold = holdOn(ITEM_ID, { idempotencyKey: 'tap-1' });
    expect(() => loaded({ holds: [hold] }).replayHold(ITEM_ID, 'tap-1', OTHER_SESSION)).toThrow(ItemUnavailableError);
  });

  it('returns null for a key not used on that item', () => {
    const elsewhere = Item.reconstitute({
      id: OTHER_ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Crib', quantity: 1, seq: 0, asOf: T0,
      holds: [holdOn(OTHER_ITEM_ID, { idempotencyKey: 'tap-1' })],
    });
    const wishlist = Wishlist.reconstitute({ ...validProps, keyGen: 1, items: [itemOf(), elsewhere] });
    expect(wishlist.replayHold(ITEM_ID, 'tap-1', SESSION)).toBeNull();
  });

  it('throws ItemNotFoundError for an item not on this list', () => {
    expect(() => loaded().replayHold(OTHER_ITEM_ID, 'tap-1', SESSION)).toThrow(ItemNotFoundError);
  });
});

describe('Wishlist.replayContribution', () => {
  const pledged = Contribution.reconstitute({
    id: '77777777-7777-7777-8777-777777777777', itemId: ITEM_ID, amountMinor: 2_500, sessionHash: SESSION,
    idempotencyKey: 'p-1', piiRef: '66666666-6666-7666-8666-666666666666', pledgedAt: T0,
  });
  const withPledge = () => Wishlist.reconstitute({
    ...validProps, keyGen: 1,
    items: [Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'group', title: 'Mixer', quantity: 1, priceMinor: 10_000, seq: 1, asOf: T0, contributions: [pledged] })],
  });

  it("returns the session's own pledge for a key it already used", () => {
    expect(withPledge().replayContribution(ITEM_ID, 'p-1', SESSION)).toBe(pledged);
  });

  it("refuses another session's key with ItemUnavailableError", () => {
    expect(() => withPledge().replayContribution(ITEM_ID, 'p-1', OTHER_SESSION)).toThrow(ItemUnavailableError);
  });

  it('returns null for a key not used on that item', () => {
    const elsewhere = Contribution.reconstitute({
      id: '88888888-8888-7888-8888-888888888888', itemId: OTHER_ITEM_ID, amountMinor: 2_500, sessionHash: SESSION,
      idempotencyKey: 'p-1', piiRef: '66666666-6666-7666-8666-666666666666', pledgedAt: T0,
    });
    const wishlist = Wishlist.reconstitute({
      ...validProps, keyGen: 1,
      items: [
        Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'group', title: 'Mixer', quantity: 1, priceMinor: 10_000, seq: 1, asOf: T0 }),
        Item.reconstitute({ id: OTHER_ITEM_ID, wishlistId: WISHLIST_ID, type: 'group', title: 'Pram', quantity: 1, priceMinor: 10_000, seq: 2, asOf: T0, contributions: [elsewhere] }),
      ],
    });
    expect(wishlist.replayContribution(ITEM_ID, 'p-1', SESSION)).toBeNull();
  });
});

describe('Wishlist.holdsForSession', () => {
  it("returns every hold that session placed on the list, whatever its state, and no one else's", () => {
    const mine = [holdOn(ITEM_ID), holdOn(ITEM_ID, { releasedAt: T0 }), holdOn(ITEM_ID, { expiresAt: at(-1) })];
    const theirs = holdOn(ITEM_ID, { sessionHash: OTHER_SESSION });
    const wishlist = loaded({ quantity: 4, holds: [...mine, theirs] });
    expect(wishlist.holdsForSession(SESSION)).toEqual(mine);
  });
});
