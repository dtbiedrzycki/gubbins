import { describe, expect, it } from 'vitest';
import { Wishlist } from './Wishlist.js';
import { Item } from './Item.js';
import { DomainValidationError, ItemNotFoundError } from '../errors.js';

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
  const itemOf = (wishlistId: string) =>
    Item.reconstitute({ id: ITEM_ID, wishlistId, type: 'single', title: 'Cot', quantity: 1, seq: 7, activeHolds: 0 });

  it('enforces the title invariant on persisted rows too', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, title: '' })).toThrow(DomainValidationError);
    expect(() => Wishlist.reconstitute({ ...persisted, title: 'a'.repeat(121) })).toThrow(DomainValidationError);
  });

  it('rejects a whitespace-only title, not just an empty one', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, title: '   ' })).toThrow(DomainValidationError);
  });

  it('restores the persisted fields as value objects', () => {
    const wishlist = Wishlist.reconstitute(persisted);
    expect(wishlist.keyGen).toBe(3);
    expect(wishlist.ownerToken.value).toBe('owner-tok');
    expect(wishlist.key.value).toBe('guest-key');
  });

  it('has no item when none was loaded', () => {
    expect(Wishlist.reconstitute(persisted).item).toBeNull();
  });

  it('attaches the loaded item, concurrency state and all', () => {
    const item = itemOf(WISHLIST_ID);
    const wishlist = Wishlist.reconstitute({ ...persisted, item });
    expect(wishlist.item).toBe(item);
    expect(wishlist.item?.seq).toBe(7);
  });

  it('rejects an item that belongs to a different wishlist', () => {
    expect(() => Wishlist.reconstitute({ ...persisted, item: itemOf(OTHER_WISHLIST_ID) }))
      .toThrow(DomainValidationError);
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

  it('starts the new item available', () => {
    const wishlist = Wishlist.create(validProps);
    expect(wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID }).status).toBe('available');
  });

  it('throws when a second item is added', () => {
    const wishlist = Wishlist.create(validProps);
    wishlist.addItem({ title: 'Cot' }, { generateId: () => ITEM_ID });
    expect(() => wishlist.addItem({ title: 'Pram' }, { generateId: () => '44444444-4444-4444-8444-444444444444' }))
      .toThrow(DomainValidationError);
  });
});

describe('Wishlist.getItem', () => {
  const withItem = () => {
    const item = Item.reconstitute({ id: ITEM_ID, wishlistId: WISHLIST_ID, type: 'single', title: 'Cot', quantity: 1, seq: 4, activeHolds: 0 });
    return { item, wishlist: Wishlist.reconstitute({ ...validProps, keyGen: 1, item }) };
  };

  it('returns the attached item when the id matches', () => {
    const { item, wishlist } = withItem();
    expect(wishlist.getItem(ITEM_ID)).toBe(item);
  });

  it('throws ItemNotFoundError when no item is attached', () => {
    expect(() => Wishlist.create(validProps).getItem(ITEM_ID)).toThrow(ItemNotFoundError);
  });

  it('throws ItemNotFoundError when the id does not match the attached item', () => {
    const { wishlist } = withItem();
    expect(() => wishlist.getItem('44444444-4444-4444-8444-444444444444')).toThrow(ItemNotFoundError);
  });

  it('returns the aggregate\'s own item, so a hold placed on it is visible through the wishlist', () => {
    const { wishlist } = withItem();
    wishlist.getItem(ITEM_ID).placeHold({
      holdId: '55555555-5555-4555-8555-555555555555', secret: 'hold-secret',
      sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1',
      expiresAt: new Date('2026-01-01T00:10:00Z'), now: new Date('2026-01-01T00:00:00Z'),
    }, { hash: () => 'b'.repeat(64) });
    expect(wishlist.item?.status).toBe('held');
  });
});
