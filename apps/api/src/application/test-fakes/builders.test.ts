import { describe, expect, it } from 'vitest';
import { aWishlist, anItem } from './builders.js';

describe('aWishlist', () => {
  it('builds a Wishlist with sensible defaults, overridable per field', () => {
    const wishlist = aWishlist().withTitle('Custom Title').build();
    expect(wishlist.title).toBe('Custom Title');
    expect(wishlist.slug.value).toBe('abc123'); // default, not overridden
  });

  it('builds an itemless Wishlist when no item is attached', () => {
    const wishlist = aWishlist().build();
    expect(wishlist.item).toBeNull();
  });

  it('attaches the item given to withItem, assigning the wishlist id', () => {
    const wishlist = aWishlist().withItem({ id: '77777777-7777-4777-8777-777777777777', title: 'Cot' }).build();
    expect(wishlist.item?.id.value).toBe('77777777-7777-4777-8777-777777777777');
    expect(wishlist.item?.title).toBe('Cot');
    expect(wishlist.item?.wishlistId.value).toBe(wishlist.id.value);
    expect(wishlist.item?.status).toBe('available');
  });
});

describe('anItem', () => {
  it('builds an Item with sensible defaults, overridable per field', () => {
    const item = anItem().withTitle('Custom Item').build();
    expect(item.title).toBe('Custom Item');
    expect(item.wishlistId.value).toBe('11111111-1111-4111-8111-111111111111'); // default, not overridden
  });
});
