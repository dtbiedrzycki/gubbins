import { createUuidId } from './UuidId.js';

/**
 * A hold's identity. Branded separately from WishlistId/ItemId so a value
 * meant for a different entity can't be passed where a HoldId is expected
 * and compile silently (same rationale as the bearer-secret VOs).
 */
export const HoldId = createUuidId('HoldId');
export type HoldId = ReturnType<typeof HoldId.from>;
