import type { HoldView } from '@gubbins/shared-types';

/** Test fixture: an active, unextended hold of 1 unit on item-1; override what a test cares about. */
export const aHoldView = (over: Partial<HoldView> = {}): HoldView => ({
  holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z', extendedAt: null,
  units: 1, purchasedUnits: null, purchasableUnits: 1,
  actions: { extend: true, release: true, purchase: true },
  ...over,
});
