import { describe, expect, it } from 'vitest';
import { Item } from './Item.js';
import { DomainValidationError, ItemAlreadyHeldError } from '../errors.js';

const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const WISHLIST_ID = '11111111-1111-4111-8111-111111111111';

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

describe('Item availability', () => {
  it('starts a new item unheld, at seq 0', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.activeHolds).toBe(0);
    expect(item.seq).toBe(0);
    expect(item.status).toBe('available');
  });

  it('restores the persisted concurrency state', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 7, activeHolds: 0 });
    expect(item.seq).toBe(7);
    expect(item.activeHolds).toBe(0);
  });

  it('derives held status once active holds reach the quantity', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 2, activeHolds: 1 });
    expect(item.quantity).toBe(1);
    expect(item.status).toBe('held');
  });

  it('restores the persisted quantity, so status is not miscalculated for multi-unit rows', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 3, seq: 2, activeHolds: 1 });
    expect(item.quantity).toBe(3);
    expect(item.status).toBe('available');
  });
});

describe('Item.placeHold', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const holdProps = {
    holdId: '55555555-5555-4555-8555-555555555555',
    secret: 'hold-secret',
    sessionHash: 'a'.repeat(64),
    idempotencyKey: 'idem-1',
    expiresAt: new Date('2026-01-01T00:10:00Z'),
    now,
  };
  const available = () =>
    Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 4, activeHolds: 0 });

  const fakeHasher = { hash: (value: string) => (value === holdProps.secret ? 'f'.repeat(64) : 'e'.repeat(64)) };

  it('mints a hold against this item', () => {
    const { hold } = available().placeHold(holdProps, fakeHasher);
    expect(hold.id.value).toBe(holdProps.holdId);
    expect(hold.itemId.value).toBe(ITEM_ID);
    expect(hold.expiresAt).toEqual(holdProps.expiresAt);
  });

  it('returns the seq the caller must append against', () => {
    expect(available().placeHold(holdProps, fakeHasher).expectedSeq).toBe(4);
  });

  it('emits an ItemHeld event carrying the hashed secret, not the raw one', () => {
    const { event } = available().placeHold(holdProps, fakeHasher);
    expect(event).toEqual({
      type: 'ItemHeld',
      itemId: ITEM_ID,
      holdId: holdProps.holdId,
      secretHash: 'f'.repeat(64),
      sessionHash: holdProps.sessionHash,
      idempotencyKey: 'idem-1',
      expiresAt: holdProps.expiresAt.toISOString(),
      occurredAt: now.toISOString(),
    });
    expect(event).not.toHaveProperty('secret');
  });

  it('records the hold against the item, which becomes held', () => {
    const item = available();
    item.placeHold(holdProps, fakeHasher);
    expect(item.activeHolds).toBe(1);
    expect(item.status).toBe('held');
    expect(item.seq).toBe(5);
  });

  it('throws ItemAlreadyHeldError when active holds have reached the quantity', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Stroller', quantity: 1, seq: 4, activeHolds: 1 });
    expect(() => item.placeHold(holdProps, fakeHasher)).toThrow(ItemAlreadyHeldError);
  });

  it('rejects an expiry that is not in the future', () => {
    expect(() => available().placeHold({ ...holdProps, expiresAt: now }, fakeHasher)).toThrow(DomainValidationError);
  });
});

describe('Item.reconstitute', () => {
  const base = { id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single' as const, title: 'Stroller', quantity: 1, seq: 0, activeHolds: 0 };

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

  it('rejects a non-positive quantity', () => {
    expect(() => Item.reconstitute({ ...base, quantity: 0 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ ...base, quantity: -1 })).toThrow(DomainValidationError);
  });

  it('rejects a fractional quantity', () => {
    expect(() => Item.reconstitute({ ...base, quantity: 1.5 })).toThrow(DomainValidationError);
  });

  it('rejects a type other than single', () => {
    expect(() => Item.reconstitute({ ...base, type: 'bundle' as unknown as 'single' })).toThrow(DomainValidationError);
  });

  it('rejects a negative seq', () => {
    expect(() => Item.reconstitute({ ...base, seq: -5 })).toThrow(DomainValidationError);
  });

  it('rejects a fractional seq', () => {
    expect(() => Item.reconstitute({ ...base, seq: 1.5 })).toThrow(DomainValidationError);
  });

  it('rejects a negative activeHolds', () => {
    expect(() => Item.reconstitute({ ...base, activeHolds: -3 })).toThrow(DomainValidationError);
  });

  it('rejects a fractional activeHolds', () => {
    expect(() => Item.reconstitute({ ...base, activeHolds: 1.5 })).toThrow(DomainValidationError);
  });
});

