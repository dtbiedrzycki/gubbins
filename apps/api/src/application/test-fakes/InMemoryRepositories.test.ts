import { describe, expect, it } from 'vitest';
import { inMemoryPersistence } from './InMemoryRepositories.js';
import { aWishlist } from './builders.js';

const WISHLIST_ID = '11111111-1111-7111-8111-111111111111';
const ITEM_ID = '33333333-3333-7333-8333-333333333333';
const T0 = new Date('2026-01-01T00:00:00.000Z');
const holdProps = { itemId: ITEM_ID, sessionHash: 'a'.repeat(64), idempotencyKey: 'idem-1', now: T0, durationMs: 60_000 };
const tokens = { generateEntityId: () => '44444444-4444-7444-8444-444444444444', generateHoldSecret: () => 'hold-secret-1' };
const hasher = { hash: (value: string) => value };

/**
 * Behaviour every repository shares is pinned by the port contract suites,
 * run against these fakes and the Kysely adapters alike. What stays here is
 * the one thing only a fake can get wrong: sharing instances with its store.
 */
describe('in-memory fakes never share instances with the store', () => {
  it('reconstitutes on every read', async () => {
    const { wishlists } = inMemoryPersistence();
    const inserted = aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build();
    await wishlists.insert(inserted);

    const first = await wishlists.findBySlug('abc123', T0);
    const second = await wishlists.findBySlug('abc123', T0);

    expect(first).not.toBe(inserted);
    expect(second).not.toBe(first);
    expect(second?.item).not.toBe(first?.item);
    expect(first?.item?.id.value).toBe(ITEM_ID);
  });

  it('does not leak an unpersisted hold decision into the next read', async () => {
    const { wishlists } = inMemoryPersistence();
    await wishlists.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());

    (await wishlists.findById(WISHLIST_ID, T0))!.holdItem(holdProps, tokens, hasher);

    const fresh = await wishlists.findById(WISHLIST_ID, T0);
    expect(fresh?.itemStatusAt(ITEM_ID, T0)).toBe('available');
    expect(fresh?.item?.seq).toBe(0);
  });

  it('does not let a caller change a stored hold through the instance it inserted', async () => {
    const { wishlists, holds } = inMemoryPersistence();
    await wishlists.insert(aWishlist().withItem({ id: ITEM_ID, title: 'Stroller' }).build());
    const { hold } = (await wishlists.findById(WISHLIST_ID, T0))!.holdItem(holdProps, tokens, hasher);
    await holds.insert(hold);

    hold.release(T0);

    expect((await holds.findById(hold.id.value))?.releasedAt).toBeNull();
  });
});
