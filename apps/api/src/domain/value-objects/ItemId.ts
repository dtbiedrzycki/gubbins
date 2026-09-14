import { createUuidId } from './UuidId.js';

/**
 * An item's identity. Branded separately from WishlistId/HoldId so a value
 * meant for a different entity can't be passed where an ItemId is expected
 * and compile silently (same rationale as the bearer-secret VOs).
 */
export const ItemId = createUuidId('ItemId');
export type ItemId = ReturnType<typeof ItemId.from>;
