import { describe, expect, it } from 'vitest';
import { Wishlist, type WishlistItemState } from './Wishlist.js';
import { Item } from './Item.js';
import { DomainValidationError, ItemAlreadyHeldError, ItemNotFoundError } from '../errors.js';

const validProps = { id: 'w1', slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };

describe('Wishlist.create', () => {
  it('creates a wishlist with keyGen starting at 1', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.id).toBe('w1');
    expect(wishlist.slug).toBe('abc123');
    expect(wishlist.title).toBe('Baby Shower');
    expect(wishlist.keyGen).toBe(1);
  });

  it('wraps the bearer secrets in value objects', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.ownerToken.value).toBe('owner-tok');
    expect(wishlist.key.value).toBe('guest-key');
  });

  it('trims the title', () => {
    const wishlist = Wishlist.create({ ...validProps, title: '  Baby Shower  ' });
    expect(wishlist.title).toBe('Baby Shower');
  });

  it('rejects an empty title', () => {
    expect(() => Wishlist.create({ ...validProps, title: '   ' })).toThrow(DomainValidationError);
  });

  it('rejects a title over 120 characters', () => {
    expect(() => Wishlist.create({ ...validProps, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
  });

  it('rejects an empty owner token', () => {
    expect(() => Wishlist.create({ ...validProps, ownerToken: '' })).toThrow(DomainValidationError);
  });

  it('rejects an empty guest key', () => {
    expect(() => Wishlist.create({ ...validProps, key: '' })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.reconstitute', () => {
  const persisted = { ...validProps, keyGen: 3 };

  it('restores the persisted fields as value objects', () => {
    const wishlist = Wishlist.reconstitute(persisted);
    expect(wishlist.keyGen).toBe(3);
    expect(wishlist.ownerToken.value).toBe('owner-tok');
    expect(wishlist.key.value).toBe('guest-key');
  });

  it('has no item when none was loaded', () => {
    expect(Wishlist.reconstitute(persisted).item).toBeNull();
  });

  it('restores the loaded item state', () => {
    const item = Item.reconstitute({ id: 'i1', wishlistId: 'w1', title: 'Cot' });
    const wishlist = Wishlist.reconstitute({
      ...persisted,
      itemState: { item, seq: 7, activeHolds: 0, status: 'available' },
    });
    expect(wishlist.item).toBe(item);
    expect(wishlist.authorizeHold('i1')).toEqual({ expectedSeq: 7 });
  });
});

describe('Wishlist.addItem', () => {
  it('attaches the item, which is then reachable through the aggregate', () => {
    const wishlist = Wishlist.create(validProps);
    const item = Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Cot' });
    wishlist.addItem(item);
    expect(wishlist.item).toBe(item);
  });

  it('throws when a second item is added', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem(Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Cot' }));
    expect(() => wishlist.addItem(Item.createSingle({ id: 'i2', wishlistId: 'w1', title: 'Pram' })))
      .toThrow(DomainValidationError);
  });
});

describe('Wishlist.itemView', () => {
  it('is null before an item is added', () => {
    expect(Wishlist.create(validProps).itemView).toBeNull();
  });

  it('reports an added item as available', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem(Item.createSingle({ id: 'i1', wishlistId: 'w1', title: 'Cot' }));
    expect(wishlist.itemView).toEqual({ id: 'i1', title: 'Cot', status: 'available' });
  });

  it('reports a held item as held', () => {
    const item = Item.reconstitute({ id: 'i1', wishlistId: 'w1', title: 'Cot' });
    const wishlist = Wishlist.reconstitute({
      ...validProps, keyGen: 1,
      itemState: { item, seq: 2, activeHolds: 1, status: 'held' },
    });
    expect(wishlist.itemView).toEqual({ id: 'i1', title: 'Cot', status: 'held' });
  });
});

describe('Wishlist.authorizeHold', () => {
  const item = Item.reconstitute({ id: 'i1', wishlistId: 'w1', title: 'Cot' });
  const withState = (itemState: WishlistItemState) =>
    Wishlist.reconstitute({ ...validProps, keyGen: 1, itemState });

  it('returns the expected seq when the item is available', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(wishlist.authorizeHold('i1')).toEqual({ expectedSeq: 4 });
  });

  it('throws ItemNotFoundError when no item is attached', () => {
    const wishlist = Wishlist.create(validProps);
    expect(() => wishlist.authorizeHold('i1')).toThrow(ItemNotFoundError);
  });

  it('throws ItemNotFoundError when the id does not match the attached item', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(() => wishlist.authorizeHold('i-other')).toThrow(ItemNotFoundError);
  });

  it('throws ItemAlreadyHeldError when active holds have reached the item quantity', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: item.quantity, status: 'held' });
    expect(() => wishlist.authorizeHold('i1')).toThrow(ItemAlreadyHeldError);
  });
});
