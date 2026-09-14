import { describe, expect, it } from 'vitest';
import { Wishlist, type WishlistItemState } from './Wishlist.js';
import { Item } from './Item.js';
import { DomainValidationError, ItemAlreadyHeldError, ItemNotFoundError } from '../errors.js';

const WISHLIST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WISHLIST_ID = '99999999-9999-4999-8999-999999999999';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

const validProps = { id: WISHLIST_ID, slug: 'abc123', title: 'Baby Shower', ownerToken: 'owner-tok', key: 'guest-key' };

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

  it('rejects an id that is not a valid UUID', () => {
    expect(() => Wishlist.create({ ...validProps, id: 'w1' })).toThrow(DomainValidationError);
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
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
    const wishlist = Wishlist.reconstitute({
      ...persisted,
      itemState: { item, seq: 7, activeHolds: 0, status: 'available' },
    });
    expect(wishlist.item).toBe(item);
    expect(wishlist.authorizeHold(item)).toEqual({ expectedSeq: 7 });
  });

  it('rejects an item state whose item belongs to a different wishlist', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: OTHER_WISHLIST_ID, title: 'Cot' });
    expect(() => Wishlist.reconstitute({
      ...persisted,
      itemState: { item, seq: 7, activeHolds: 0, status: 'available' },
    })).toThrow(DomainValidationError);
  });
});

describe('Wishlist.addItem', () => {
  it('attaches the item, which is then reachable through the aggregate', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(wishlist.item).toBe(item);
  });

  it('assigns the wishlist\'s own id to the created item', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(item.wishlistId.value).toBe(WISHLIST_ID);
  });

  it('mints the item id via the supplied generator, not the caller', () => {
    const wishlist = Wishlist.create(validProps);
    const item = wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(item.id.value).toBe(ITEM_ID);
  });

  it('throws when a second item is added', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(() => wishlist.addItem({ title: 'Pram' }, { generateId: () => '44444444-4444-4444-8444-444444444444' }))
      .toThrow(DomainValidationError);
  });
});

describe('Wishlist.toItemView', () => {
  it('is null before an item is added', () => {
    expect(Wishlist.create(validProps).toItemView()).toBeNull();
  });

  it('reports an added item as available', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(wishlist.toItemView()).toEqual({ id: ITEM_ID, title: 'Cot', status: 'available' });
  });

  it('reports a held item as held', () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
    const wishlist = Wishlist.reconstitute({
      ...validProps, keyGen: 1,
      itemState: { item, seq: 2, activeHolds: 1, status: 'held' },
    });
    expect(wishlist.toItemView()).toEqual({ id: ITEM_ID, title: 'Cot', status: 'held' });
  });
});

describe('Wishlist.authorizeHold', () => {
  const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
  const withState = (itemState: WishlistItemState) =>
    Wishlist.reconstitute({ ...validProps, keyGen: 1, itemState });

  it('returns the expected seq when the item is available', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(wishlist.authorizeHold(item)).toEqual({ expectedSeq: 4 });
  });

  it('throws ItemNotFoundError when no item is attached', () => {
    const wishlist = Wishlist.create(validProps);
    expect(() => wishlist.authorizeHold(item)).toThrow(ItemNotFoundError);
  });

  it('throws ItemNotFoundError when the given item does not match the attached item', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    const otherItem = Item.reconstitute({ id: '44444444-4444-4444-8444-444444444444', wishlistId: WISHLIST_ID, title: 'Pram' });
    expect(() => wishlist.authorizeHold(otherItem)).toThrow(ItemNotFoundError);
  });

  it('throws ItemNotFoundError for a separately-constructed item with the same id, not the attached reference', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    // Same id/wishlistId as the attached item, but a distinct object — id-value equality
    // would let this through; reference identity (the actual guarantee) must not.
    const lookalike = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
    expect(() => wishlist.authorizeHold(lookalike)).toThrow(ItemNotFoundError);
  });

  it('throws ItemAlreadyHeldError when active holds have reached the item quantity', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: item.quantity, status: 'held' });
    expect(() => wishlist.authorizeHold(item)).toThrow(ItemAlreadyHeldError);
  });
});

describe('Wishlist.getItem', () => {
  const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, title: 'Cot' });
  const withState = (itemState: WishlistItemState) =>
    Wishlist.reconstitute({ ...validProps, keyGen: 1, itemState });

  it('returns the attached item when the id matches', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(wishlist.getItem(ITEM_ID)).toBe(item);
  });

  it('throws ItemNotFoundError when no item is attached', () => {
    const wishlist = Wishlist.create(validProps);
    expect(() => wishlist.getItem(ITEM_ID)).toThrow(ItemNotFoundError);
  });

  it('throws ItemNotFoundError when the id does not match the attached item', () => {
    const wishlist = withState({ item, seq: 4, activeHolds: 0, status: 'available' });
    expect(() => wishlist.getItem('44444444-4444-4444-8444-444444444444')).toThrow(ItemNotFoundError);
  });
});
