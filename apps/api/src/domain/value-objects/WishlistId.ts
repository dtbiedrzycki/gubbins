import { createUuidId } from './UuidId.js';

/**
 * A wishlist's identity. Branded separately from ItemId/HoldId so a value
 * meant for a different entity can't be passed where a WishlistId is
 * expected and compile silently (same rationale as the bearer-secret VOs).
 */
export const WishlistId = createUuidId('WishlistId');
export type WishlistId = ReturnType<typeof WishlistId.from>;
