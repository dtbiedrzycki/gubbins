import type { Hold } from '../../domain/entities/Hold.js';
import { WishlistNotFoundError } from '../../domain/errors.js';
import type { GuestDetails } from '../../domain/value-objects/GuestDetails.js';
import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';

export interface Contributions {
  items: {
    itemId: string;
    purchases: { name: string; message: string | null; units: number; purchasedAt: Date }[];
    holds: { name: string; units: number; expiresAt: Date }[];
    pledges: { name: string; message: string | null; amountMinor: number; pledgedAt: Date }[];
  }[];
}

/** Who bought, holds and pledged each gift, with their names and messages: what the owner reveals on demand (ADR-0089). */
export class GetContributions {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute(input: { wishlistId: string }, access: AccessContext): Promise<Contributions> {
    // Not the owner is the same as no list (ADR-0016).
    if (!access.owner) throw new WishlistNotFoundError(input.wishlistId);

    return this.unitOfWork.execute(async (ctx) => {
      const wishlist = await ctx.wishlists.findById(input.wishlistId, this.clock.now());
      if (!wishlist) throw new WishlistNotFoundError(input.wishlistId);

      const items = wishlist.items.map((item) => ({ item, purchased: item.purchasedHolds(), active: item.activeHolds() }));
      const refs = items.flatMap(({ item, purchased, active }) => [
        ...[...purchased, ...active].map((hold) => hold.piiRef?.value),
        ...item.contributions.map((c) => c.piiRef.value),
      ]).filter((ref): ref is string => ref !== undefined);
      const guests = await ctx.guestPii.findByIds(refs);
      // Hold still allows a null piiRef for rows from before names were stored; a released database has none, so this is corrupt data.
      const guestOf = (hold: Hold): GuestDetails => {
        const guest = hold.piiRef && guests.get(hold.piiRef.value);
        if (!guest) throw new Error(`guest details missing for hold ${hold.id.value}`);
        return guest;
      };

      return {
        items: items.map(({ item, purchased, active }) => ({
          itemId: item.id.value,
          // Holds load oldest expiry first, so purchases need their own order.
          purchases: [...purchased]
            .sort((a, b) => a.purchasedAt!.getTime() - b.purchasedAt!.getTime())
            .map((hold) => {
              const guest = guestOf(hold);
              return { name: guest.name, message: guest.message, units: hold.purchasedUnits!, purchasedAt: hold.purchasedAt! };
            }),
          holds: active.map((hold) => ({ name: guestOf(hold).name, units: hold.units, expiresAt: hold.expiresAt })),
          pledges: item.contributions.map((c) => {
            // A contribution's pii_ref is NOT NULL with a foreign key, so its row is always there.
            const guest = guests.get(c.piiRef.value)!;
            return { name: guest.name, message: guest.message, amountMinor: c.amount.amountMinor, pledgedAt: c.pledgedAt };
          }),
        })),
      };
    });
  }
}
