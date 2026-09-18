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
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller', seq: 7, activeHolds: 0 });
    expect(item.seq).toBe(7);
    expect(item.activeHolds).toBe(0);
  });

  it('derives held status once active holds reach the quantity', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller', seq: 2, activeHolds: 1 });
    expect(item.quantity).toBe(1);
    expect(item.status).toBe('held');
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
    Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller', seq: 4, activeHolds: 0 });

  it('mints a hold against this item', () => {
    const { hold } = available().placeHold(holdProps);
    expect(hold.id.value).toBe(holdProps.holdId);
    expect(hold.itemId.value).toBe(ITEM_ID);
    expect(hold.expiresAt).toEqual(holdProps.expiresAt);
  });

  it('returns the seq the caller must append against', () => {
    expect(available().placeHold(holdProps).expectedSeq).toBe(4);
  });

  it('emits an ItemHeld event describing the hold', () => {
    const { event } = available().placeHold(holdProps);
    expect(event).toEqual({
      type: 'ItemHeld',
      itemId: ITEM_ID,
      holdId: holdProps.holdId,
      secret: 'hold-secret',
      sessionHash: holdProps.sessionHash,
      idempotencyKey: 'idem-1',
      expiresAt: holdProps.expiresAt.toISOString(),
      occurredAt: now.toISOString(),
    });
  });

  it('records the hold against the item, which becomes held', () => {
    const item = available();
    item.placeHold(holdProps);
    expect(item.activeHolds).toBe(1);
    expect(item.status).toBe('held');
    expect(item.seq).toBe(5);
  });

  it('throws ItemAlreadyHeldError when active holds have reached the quantity', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller', seq: 4, activeHolds: 1 });
    expect(() => item.placeHold(holdProps)).toThrow(ItemAlreadyHeldError);
  });

  it('rejects an expiry that is not in the future', () => {
    expect(() => available().placeHold({ ...holdProps, expiresAt: now })).toThrow(DomainValidationError);
  });
});

describe('Item.reconstitute', () => {
  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: '', seq: 0, activeHolds: 0 })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'a'.repeat(121), seq: 0, activeHolds: 0 })).toThrow(
      DomainValidationError,
    );
  });
});

