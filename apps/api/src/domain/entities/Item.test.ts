import { describe, expect, it } from 'vitest';
import { Item } from './Item.js';
import { ContributionAmountError, DomainValidationError, ItemUnavailableError } from '../errors.js';

const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const DAY = 86_400_000;
const base = { id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 0 };

describe('Item.createSingle', () => {
  it('creates a single-type item with quantity 1', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(1);
    expect(item.title).toBe('Stroller');
  });

  it('rejects an empty title', () => {
    expect(() => Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: '  ' })).toThrow(DomainValidationError);
  });

  it('rejects an id that is not a valid UUID', () => {
    expect(() => Item.createSingle({ id: 'i1', wishlistId: WISHLIST_ID, title: 'Stroller' })).toThrow(DomainValidationError);
  });
});

describe('Item kinds, URL and price', () => {
  const ID = ITEM_ID;
  const WL = WISHLIST_ID;
  it.each(['javascript:alert(1)', 'http://shop.example/x', 'data:text/html,hi', 'shop.example', 'https://' + 'a'.repeat(2050)])('refuses a store URL that is not a short https URL (%j)', (url) => {
    expect(() => Item.createSingle({ id: ID, wishlistId: WL, title: 'T', url })).toThrow(DomainValidationError);
  });
  it('accepts an https store URL', () => {
    expect(Item.createSingle({ id: ID, wishlistId: WL, title: 'T', url: 'https://shop.example/x' }).url).toBe('https://shop.example/x');
  });
  it.each([0, -1, 1.5, 10 ** 12 + 1])('refuses price %j', (priceMinor) => {
    expect(() => Item.createSingle({ id: ID, wishlistId: WL, title: 'T', priceMinor })).toThrow(DomainValidationError);
  });
  it('creates a single with the quantity given', () => {
    expect(Item.createSingle({ id: ID, wishlistId: WL, title: 'T', quantity: 3 }).quantity).toBe(3);
  });
  it('creates a group gift as one unit, refusing one without a price or with a quantity other than 1', () => {
    const group = Item.createGroup({ id: ID, wishlistId: WL, title: 'Mixer', priceMinor: 45000 });
    expect([group.type, group.quantity, group.priceMinor]).toEqual(['group', 1, 45000]);
    expect(() => Item.reconstitute({ id: ID, wishlistId: WL, type: 'group', title: 'M', quantity: 1, url: null, priceMinor: null, seq: 0 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ id: ID, wishlistId: WL, type: 'group', title: 'M', quantity: 2, url: null, priceMinor: 45000, seq: 0 })).toThrow(DomainValidationError);
  });
});

describe('Item availability — from hold state, never a stored counter', () => {
  it('starts a new item at seq 0, and available', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.seq).toBe(0);
    expect(item.statusGiven(0, 0)).toBe('available');
  });

  it('restores the persisted seq', () => {
    expect(Item.reconstitute({ ...base, seq: 7 }).seq).toBe(7);
  });

  it('has a free unit while active holds plus purchases stay below quantity', () => {
    const item = Item.reconstitute({ ...base, quantity: 3 });
    expect(item.availableUnits(1, 1)).toBe(1);
    expect(item.statusGiven(1, 1)).toBe('available');
  });

  it('is held once active holds take the last unit', () => {
    const item = Item.reconstitute(base);
    expect(item.availableUnits(1, 0)).toBe(0);
    expect(item.statusGiven(1, 0)).toBe('held');
  });

  it('is purchased once purchases alone cover the quantity', () => {
    expect(Item.reconstitute(base).statusGiven(0, 1)).toBe('purchased');
  });

  it('never reports negative availability when quantity is below what is committed (ADR-0019)', () => {
    expect(Item.reconstitute(base).availableUnits(2, 1)).toBe(0);
  });
});

describe('Item.placeHold', () => {
  const at = new Date('2026-01-01T00:00:00Z');
  const GENERATED_HOLD_ID = '55555555-5555-7555-8555-555555555555';
  const GENERATED_SECRET = 'hold-secret';
  const holdProps = { sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1', at, durationMs: 3 * DAY, piiRef: '66666666-6666-7666-8666-666666666666' };
  const available = () => Item.reconstitute({ ...base, seq: 4 });
  const fakeTokens = { generateEntityId: () => GENERATED_HOLD_ID, generateHoldSecret: () => GENERATED_SECRET };
  const fakeHasher = { hash: (value: string) => (value === GENERATED_SECRET ? 'f'.repeat(64) : 'e'.repeat(64)) };

  it('mints a hold on this item that expires one duration after the given instant', () => {
    const { hold } = available().placeHold(holdProps, 0, 0, fakeTokens, fakeHasher);
    expect(hold.id.value).toBe(GENERATED_HOLD_ID);
    expect(hold.secret.value).toBe(GENERATED_SECRET);
    expect(hold.itemId.value).toBe(ITEM_ID);
    expect(hold.expiresAt).toEqual(new Date(at.getTime() + 3 * DAY));
  });

  it('returns the seq the caller must append against, and advances past it', () => {
    const item = available();
    expect(item.placeHold(holdProps, 0, 0, fakeTokens, fakeHasher).expectedSeq).toBe(4);
    expect(item.seq).toBe(5);
  });

  it('emits an ItemHeld event carrying the hashed secret, not the raw one', () => {
    const { event } = available().placeHold(holdProps, 0, 0, fakeTokens, fakeHasher);
    expect(event).toEqual({
      type: 'ItemHeld', v: 1, itemId: ITEM_ID, holdId: GENERATED_HOLD_ID, secretHash: 'f'.repeat(64),
      sessionHash: holdProps.sessionHash, idempotencyKey: 'idem-1', piiRef: holdProps.piiRef,
      expiresAt: new Date(at.getTime() + 3 * DAY).toISOString(), occurredAt: at.toISOString(),
    });
    expect(event).not.toHaveProperty('secret');
  });

  it('records the piiRef on the hold and on ItemHeld', () => {
    const piiRef = '66666666-6666-7666-8666-666666666666';
    const { hold, event } = available().placeHold({ ...holdProps, piiRef }, 0, 0, fakeTokens, fakeHasher);
    expect(hold.piiRef?.value).toBe(piiRef);
    expect(event.piiRef).toBe(piiRef);
    expect(event).not.toHaveProperty('name');
    expect(event).not.toHaveProperty('message');
  });

  it('throws ItemUnavailableError when active holds cover the quantity, without advancing seq', () => {
    const item = available();
    expect(() => item.placeHold(holdProps, 1, 0, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
    expect(item.seq).toBe(4);
  });

  it('throws ItemUnavailableError when purchases cover the quantity', () => {
    const item = Item.reconstitute(base);
    expect(() => item.placeHold(holdProps, 0, 1, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
  });

  it('cannot be held when it is a group gift', () => {
    const group = Item.createGroup({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Mixer', priceMinor: 45000 });
    expect(() => group.placeHold(holdProps, 0, 0, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
  });

  it('rejects a duration that does not put the expiry in the future', () => {
    expect(() => available().placeHold({ ...holdProps, durationMs: 0 }, 0, 0, fakeTokens, fakeHasher)).toThrow(DomainValidationError);
  });
});

describe('Item.recordEvent', () => {
  it('recordEvent returns the seq before the event and advances by one', () => {
    const item = Item.reconstitute({ ...base, seq: 2 });
    expect(item.recordEvent()).toBe(2);
    expect(item.seq).toBe(3);
  });
});

describe('Item.reconstitute', () => {
  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Item.reconstitute({ ...base, title: '' })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
  });

  it('rejects a whitespace-only title, not just an empty one', () => {
    expect(() => Item.reconstitute({ ...base, title: '   ' })).toThrow(DomainValidationError);
  });

  it('passes through the persisted type and quantity', () => {
    const item = Item.reconstitute({ ...base, quantity: 3 });
    expect(item.type).toBe('single');
    expect(item.quantity).toBe(3);
  });

  it('rejects a non-positive or fractional quantity', () => {
    expect(() => Item.reconstitute({ ...base, quantity: 0 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, quantity: -1 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, quantity: 1.5 })).toThrow(DomainValidationError);
  });

  it('refuses an unknown type', () => {
    expect(() => Item.reconstitute({ ...base, type: 'bundle' })).toThrow(DomainValidationError);
  });

  it('rejects a negative or fractional seq', () => {
    expect(() => Item.reconstitute({ ...base, seq: -5 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, seq: 1.5 })).toThrow(DomainValidationError);
  });
});

describe('Item.pledge', () => {
  const CONTRIBUTION_ID = '44444444-4444-7444-8444-444444444444';
  const PII = '55555555-5555-7555-8555-555555555555';
  const ids = { generateEntityId: () => CONTRIBUTION_ID };
  const group = () => Item.createGroup({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Mixer', priceMinor: 45000 });
  const props = { sessionHash: 'a'.repeat(64), idempotencyKey: 'k1', piiRef: PII, at: new Date('2026-10-13T10:00:00Z') };

  it('records the pledge and advances the stream', () => {
    const item = group();
    const { contribution, event, expectedSeq } = item.pledge({ ...props, amountMinor: 11250 }, ids);
    expect([contribution.amount.amountMinor, event.type, event.amountMinor, expectedSeq, item.seq]).toEqual([11250, 'ContributionPledged', 11250, 0, 1]);
    expect(event.piiRef).toBe(PII);
    expect(Object.keys(event)).not.toEqual(expect.arrayContaining(['name', 'message']));
  });
  it('allows overfunding up to five times the price', () => {
    expect(() => group().pledge({ ...props, amountMinor: 45000 * 5 }, ids)).not.toThrow();
  });
  it.each([0, -100, 12.5, 45000 * 5 + 1])('refuses amount %j', (amountMinor) => {
    expect(() => group().pledge({ ...props, amountMinor }, ids)).toThrow(ContributionAmountError);
  });
  it('refuses a pledge on a single item', () => {
    const single = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Crib' });
    expect(() => single.pledge({ ...props, amountMinor: 100 }, ids)).toThrow(ItemUnavailableError);
  });
});
