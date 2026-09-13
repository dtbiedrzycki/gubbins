import { describe, expect, it } from 'vitest';
import { InMemoryWishlistRepository } from './InMemoryRepositories.js';
import { aWishlist, anItem } from './builders.js';
import { ItemAlreadyHeldError, ItemNotFoundError } from '../../domain/errors.js';

describe('InMemoryWishlistRepository', () => {
  it('returns the inserted wishlist with its item attached, by slug and by id', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().withItem(anItem().build()).build());

    for (const loaded of [await repo.findBySlug('abc123'), await repo.findById('w1')]) {
      expect(loaded?.itemView).toEqual({ id: 'item-1', title: 'Stroller', status: 'available' });
    }
  });

  it('returns null for a slug or id that was never inserted', async () => {
    const repo = new InMemoryWishlistRepository();
    expect(await repo.findBySlug('nope')).toBeNull();
    expect(await repo.findById('nope')).toBeNull();
  });

  it('round-trips a wishlist that has no item', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().build());

    const loaded = await repo.findBySlug('abc123');
    expect(loaded?.item).toBeNull();
  });

  it('marks the item held, so the reloaded aggregate refuses a second hold', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().withItem(anItem().build()).build());
    const beforeHold = await repo.findById('w1');
    expect(beforeHold?.authorizeHold('item-1')).toEqual({ expectedSeq: 0 });

    await repo.markItemHeld('w1', 'item-1', 1);

    const afterHold = await repo.findById('w1');
    expect(afterHold?.itemView?.status).toBe('held');
    expect(() => afterHold?.authorizeHold('item-1')).toThrow(ItemAlreadyHeldError);
  });

  it('preserves the wishlist fields when it rebuilds the aggregate after a hold', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(
      aWishlist().withOwnerToken('tok-abc').withKey('key-xyz').withItem(anItem().build()).build(),
    );

    await repo.markItemHeld('w1', 'item-1', 1);

    const loaded = await repo.findBySlug('abc123');
    expect(loaded?.ownerToken.value).toBe('tok-abc');
    expect(loaded?.key.value).toBe('key-xyz');
    expect(loaded?.title).toBe('Baby Shower');
    expect(loaded?.keyGen).toBe(1);
  });

  it('refuses to mark an item held through a wishlist that does not own it', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().withItem(anItem().build()).build());
    await repo.insert(aWishlist().withId('w2').withSlug('def456').build());

    await expect(repo.markItemHeld('w2', 'item-1', 1)).rejects.toThrow(ItemNotFoundError);
    expect((await repo.findById('w1'))?.itemView?.status).toBe('available');
  });
});
