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
    const wishlist = aWishlist().withItem({ id: '77777777-7777-7777-8777-777777777777', title: 'Cot' }).build();
    expect(wishlist.item?.id.value).toBe('77777777-7777-7777-8777-777777777777');
    expect(wishlist.item?.title).toBe('Cot');
    expect(wishlist.item?.wishlistId.value).toBe(wishlist.id.value);
    expect(wishlist.itemStatus('77777777-7777-7777-8777-777777777777')).toBe('available');
  });

  it('decides as of the instant given to asOf', () => {
    const wishlist = aWishlist().withItem({ id: '77777777-7777-7777-8777-777777777777', title: 'Cot' }).asOf(new Date('2026-05-01T00:00:00Z')).build();
    const { hold } = wishlist.holdItem(
      { itemId: '77777777-7777-7777-8777-777777777777', sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1', durationMs: 60_000 },
      { generateEntityId: () => '44444444-4444-7444-8444-444444444444', generateHoldSecret: () => 'hold-secret' },
      { hash: (value: string) => value },
    );
    expect(hold.expiresAt).toEqual(new Date('2026-05-01T00:01:00Z'));
  });

  it('loads the wishlist with the purchased count it was given', () => {
    const wishlist = aWishlist().withItem({ id: '77777777-7777-7777-8777-777777777777', title: 'Cot' }).withPurchasedCount(1).build();
    expect(wishlist.purchasedCountOf('77777777-7777-7777-8777-777777777777')).toBe(1);
    expect(wishlist.itemStatus('77777777-7777-7777-8777-777777777777')).toBe('purchased');
  });
});

describe('anItem', () => {
  it('builds an Item with sensible defaults, overridable per field', () => {
    const item = anItem().withTitle('Custom Item').build();
    expect(item.title).toBe('Custom Item');
    expect(item.wishlistId.value).toBe('11111111-1111-7111-8111-111111111111'); // default, not overridden
  });
});
