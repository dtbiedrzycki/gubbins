import { describe, expect, it } from 'vitest';
import { aWishlist, anItem } from './builders.js';

describe('aWishlist', () => {
  it('builds a Wishlist with sensible defaults, overridable per field', () => {
    const wishlist = aWishlist().withTitle('Custom Title').build();
    expect(wishlist.title).toBe('Custom Title');
    expect(wishlist.slug).toBe('abc123'); // default, not overridden
  });
});

describe('anItem', () => {
  it('builds an Item with sensible defaults, overridable per field', () => {
    const item = anItem().withTitle('Custom Item').build();
    expect(item.title).toBe('Custom Item');
    expect(item.wishlistId).toBe('w1'); // default, not overridden
  });
});
