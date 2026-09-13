import { describe, expect, it } from 'vitest';
import { aWishlist, anItem } from './builders.js';

describe('aWishlist', () => {
  it('builds a Wishlist with sensible defaults, overridable per field', () => {
    const wishlist = aWishlist().withTitle('Custom Title').build();
    expect(wishlist.title).toBe('Custom Title');
    expect(wishlist.slug).toBe('abc123'); // default, not overridden
  });

  it('builds an itemless Wishlist when no item is attached', () => {
    const wishlist = aWishlist().build();
    expect(wishlist.item).toBeNull();
    expect(wishlist.itemView).toBeNull();
  });

  it('attaches the item given to withItem', () => {
    const item = anItem().withId('item-9').withTitle('Cot').build();
    const wishlist = aWishlist().withItem(item).build();
    expect(wishlist.item).toBe(item);
    expect(wishlist.itemView).toEqual({ id: 'item-9', title: 'Cot', status: 'available' });
  });
});

describe('anItem', () => {
  it('builds an Item with sensible defaults, overridable per field', () => {
    const item = anItem().withTitle('Custom Item').build();
    expect(item.title).toBe('Custom Item');
    expect(item.wishlistId).toBe('w1'); // default, not overridden
  });
});
