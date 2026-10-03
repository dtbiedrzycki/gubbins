import { describe, expect, it } from 'vitest';
import { Item } from './Item.js';
import { DomainValidationError, ItemUnavailableError } from '../errors.js';

const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const DAY = 86_400_000;
const base = { id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 0, purchasedCount: 0 };

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

describe('Item availability — from hold state, never a stored counter', () => {
  it('starts a new item at seq 0 with nothing purchased, and available', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.seq).toBe(0);
    expect(item.purchasedCount).toBe(0);
    expect(item.statusGiven(0)).toBe('available');
  });

  it('restores the persisted seq and purchase count', () => {
    const item = Item.reconstitute({ ...base, seq: 7, purchasedCount: 1 });
    expect(item.seq).toBe(7);
    expect(item.purchasedCount).toBe(1);
  });

  it('has a free unit while active holds plus purchases stay below quantity', () => {
    const item = Item.reconstitute({ ...base, quantity: 3, purchasedCount: 1 });
    expect(item.availableUnits(1)).toBe(1);
    expect(item.statusGiven(1)).toBe('available');
  });

  it('is held once active holds take the last unit', () => {
    const item = Item.reconstitute(base);
    expect(item.availableUnits(1)).toBe(0);
    expect(item.statusGiven(1)).toBe('held');
  });

  it('is purchased once purchases alone cover the quantity', () => {
    expect(Item.reconstitute({ ...base, purchasedCount: 1 }).statusGiven(0)).toBe('purchased');
  });

  it('never reports negative availability when quantity is below what is committed (ADR-0019)', () => {
    expect(Item.reconstitute({ ...base, purchasedCount: 1 }).availableUnits(2)).toBe(0);
  });
});

describe('Item.placeHold', () => {
  const at = new Date('2026-01-01T00:00:00Z');
  const GENERATED_HOLD_ID = '55555555-5555-7555-8555-555555555555';
  const GENERATED_SECRET = 'hold-secret';
  const holdProps = { sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1', at, durationMs: 3 * DAY };
  const available = () => Item.reconstitute({ ...base, seq: 4 });
  const fakeTokens = { generateEntityId: () => GENERATED_HOLD_ID, generateHoldSecret: () => GENERATED_SECRET };
  const fakeHasher = { hash: (value: string) => (value === GENERATED_SECRET ? 'f'.repeat(64) : 'e'.repeat(64)) };

  it('mints a hold on this item that expires one duration after the given instant', () => {
    const { hold } = available().placeHold(holdProps, 0, fakeTokens, fakeHasher);
    expect(hold.id.value).toBe(GENERATED_HOLD_ID);
    expect(hold.secret.value).toBe(GENERATED_SECRET);
    expect(hold.itemId.value).toBe(ITEM_ID);
    expect(hold.expiresAt).toEqual(new Date(at.getTime() + 3 * DAY));
  });

  it('returns the seq the caller must append against, and advances past it', () => {
    const item = available();
    expect(item.placeHold(holdProps, 0, fakeTokens, fakeHasher).expectedSeq).toBe(4);
    expect(item.seq).toBe(5);
  });

  it('emits an ItemHeld event carrying the hashed secret, not the raw one', () => {
    const { event } = available().placeHold(holdProps, 0, fakeTokens, fakeHasher);
    expect(event).toEqual({
      type: 'ItemHeld', v: 1, itemId: ITEM_ID, holdId: GENERATED_HOLD_ID, secretHash: 'f'.repeat(64),
      sessionHash: holdProps.sessionHash, idempotencyKey: 'idem-1',
      expiresAt: new Date(at.getTime() + 3 * DAY).toISOString(), occurredAt: at.toISOString(),
    });
    expect(event).not.toHaveProperty('secret');
  });

  it('throws ItemUnavailableError when active holds cover the quantity, without advancing seq', () => {
    const item = available();
    expect(() => item.placeHold(holdProps, 1, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
    expect(item.seq).toBe(4);
  });

  it('throws ItemUnavailableError when purchases cover the quantity', () => {
    const item = Item.reconstitute({ ...base, purchasedCount: 1 });
    expect(() => item.placeHold(holdProps, 0, fakeTokens, fakeHasher)).toThrow(ItemUnavailableError);
  });

  it('rejects a duration that does not put the expiry in the future', () => {
    expect(() => available().placeHold({ ...holdProps, durationMs: 0 }, 0, fakeTokens, fakeHasher)).toThrow(DomainValidationError);
  });
});

describe('Item.recordEvent and recordPurchase', () => {
  it('recordEvent returns the seq before the event and advances by one', () => {
    const item = Item.reconstitute({ ...base, seq: 2 });
    expect(item.recordEvent()).toBe(2);
    expect(item.seq).toBe(3);
  });

  it('recordPurchase counts the unit as gone for good and records one event', () => {
    const item = Item.reconstitute({ ...base, seq: 2 });
    expect(item.recordPurchase()).toBe(2);
    expect(item.purchasedCount).toBe(1);
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

  it('rejects a type other than single', () => {
    expect(() => Item.reconstitute({ ...base, type: 'bundle' })).toThrow(DomainValidationError);
  });

  it('rejects a negative or fractional seq', () => {
    expect(() => Item.reconstitute({ ...base, seq: -5 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, seq: 1.5 })).toThrow(DomainValidationError);
  });

  it('rejects a negative or fractional purchasedCount', () => {
    expect(() => Item.reconstitute({ ...base, purchasedCount: -1 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, purchasedCount: 0.5 })).toThrow(DomainValidationError);
  });
});
