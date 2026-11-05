import type { Hold, HoldStatus } from '../../domain/entities/Hold.js';
import type { Wishlist } from '../../domain/entities/Wishlist.js';

/** A hold as its own guest sees it. Mirrors `holdViewSchema` in @gubbins/shared-types, which validates it on the way out. */
export interface HoldView {
  holdId: string;
  itemId: string;
  status: HoldStatus;
  expiresAt: string;
  extendedAt: string | null;
  /** Units the hold covers. */
  units: number;
  /** Units bought; null until purchased. */
  purchasedUnits: number | null;
  /** The most units a purchase would accept now. */
  purchasableUnits: number;
  /**
   * What the guest may do next, decided by the domain so the UI never
   * re-derives a rule: extend once while active, release while active,
   * purchase while active, or while expired with a unit still free.
   */
  actions: { extend: boolean; release: boolean; purchase: boolean };
}

/** `hold` as of the instant `wishlist` was loaded at; the wishlist answers every rule. */
export function toHoldView(wishlist: Wishlist, hold: Hold): HoldView {
  return {
    holdId: hold.id.value,
    itemId: hold.itemId.value,
    status: wishlist.holdStatus(hold),
    expiresAt: hold.expiresAt.toISOString(),
    extendedAt: hold.extendedAt?.toISOString() ?? null,
    units: hold.units,
    purchasedUnits: hold.purchasedUnits,
    purchasableUnits: wishlist.purchasableUnits(hold),
    actions: {
      extend: wishlist.canExtendHold(hold),
      release: wishlist.canReleaseHold(hold),
      purchase: wishlist.canPurchaseHold(hold),
    },
  };
}
