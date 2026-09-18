import { describe, expect, it } from 'vitest';
import { InMemoryWishlistRepository } from './InMemoryRepositories.js';
import { aWishlist } from './builders.js';
import { ItemAlreadyHeldError, ItemNotFoundError } from '../../domain/errors.js';

const WISHLIST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WISHLIST_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

describe('InMemoryWishlistRepository', () => {
  it('returns the inserted wishlist with its item attached, by slug and by id', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());

    for (const loaded of [await repo.findBySlug('abc123'), await repo.findById(WISHLIST_ID)]) {
      expect(loaded?.item?.id.value).toBe(ITEM_ID);
      expect(loaded?.item?.title).toBe('Stroller');
      expect(loaded?.item?.status).toBe('available');
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

  it('reconstitutes on every read rather than handing back the stored instance', async () => {
    const repo = new InMemoryWishlistRepository();
    const inserted = aWishlist().build();
    await repo.insert(inserted);

    const loaded = await repo.findBySlug('abc123');
    expect(loaded).not.toBe(inserted);
    expect(loaded?.id.value).toBe(inserted.id.value);
    expect(loaded?.slug.value).toBe(inserted.slug.value);
    expect(loaded?.title).toBe(inserted.title);
    expect(loaded?.keyGen).toBe(inserted.keyGen);
  });

  it('marks the item held, so the reloaded aggregate refuses a second hold', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    const beforeHold = await repo.findById(WISHLIST_ID);
    const itemBeforeHold = beforeHold!.getItem(ITEM_ID);
    expect(itemBeforeHold.status).toBe('available');
    expect(itemBeforeHold.seq).toBe(0);

    await repo.markItemHeld(WISHLIST_ID, ITEM_ID, 1);

    const afterHold = await repo.findById(WISHLIST_ID);
    expect(afterHold?.item?.status).toBe('held');
    expect(() => afterHold!.getItem(ITEM_ID).placeHold({
      sessionHash: 'irrelevant',
      idempotencyKey: 'irrelevant',
      expiresAt: new Date(),
      now: new Date(),
    }, {
      generateId: () => '44444444-4444-4444-8444-444444444444',
      generateHoldSecret: () => 'irrelevant',
    }, { hash: (value: string) => value })).toThrow(ItemAlreadyHeldError);
  });

  it('preserves the wishlist fields when it rebuilds the aggregate after a hold', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(
      aWishlist().withOwnerToken('tok-abc').withKey('key-xyz').withItem({ id: ITEM_ID, title: 'Stroller' }).build(),
    );

    await repo.markItemHeld(WISHLIST_ID, ITEM_ID, 1);

    const loaded = await repo.findBySlug('abc123');
    expect(loaded?.ownerToken.value).toBe('tok-abc');
    expect(loaded?.key.value).toBe('key-xyz');
    expect(loaded?.title).toBe('Baby Shower');
    expect(loaded?.keyGen).toBe(1);
  });

  it('refuses to mark an item held through a wishlist that does not own it', async () => {
    const repo = new InMemoryWishlistRepository();
    await repo.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    await repo.insert(aWishlist().withId(OTHER_WISHLIST_ID).withSlug('def456').build());

    await expect(repo.markItemHeld(OTHER_WISHLIST_ID, ITEM_ID, 1)).rejects.toThrow(ItemNotFoundError);
    expect((await repo.findById(WISHLIST_ID))?.item?.status).toBe('available');
  });
});
