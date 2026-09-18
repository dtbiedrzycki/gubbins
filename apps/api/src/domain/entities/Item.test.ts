import { describe, expect, it } from 'vitest';
import { Item } from './Item.js';
import { DomainValidationError } from '../errors.js';

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

describe('Item.reconstitute', () => {
  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: '' })).toThrow(DomainValidationError);
    expect(() => Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'a'.repeat(121) })).toThrow(
      DomainValidationError,
    );
  });
});

describe('Item.toView', () => {
  it('composes id, title, and the supplied status', () => {
    const item = Item.createSingle({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Stroller' });
    expect(item.toView('available')).toEqual({ id: ITEM_ID, title: 'Stroller', status: 'available' });
    expect(item.toView('held')).toEqual({ id: ITEM_ID, title: 'Stroller', status: 'held' });
  });
});
