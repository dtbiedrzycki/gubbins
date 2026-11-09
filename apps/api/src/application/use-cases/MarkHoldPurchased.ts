import { GuestDetails } from '../../domain/value-objects/GuestDetails.js';
import { HoldPermissions } from '../../domain/policies/HoldPermissions.js';
import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { HoldView } from '../views/HoldView.js';
import { runHoldCommand, type HoldCommand, type HoldCommandInput } from './holdCommand.js';

export class MarkHoldPurchased implements HoldCommand {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute(input: HoldCommandInput & { units: number; message?: string }, access: AccessContext): Promise<HoldView> {
    return this.unitOfWork.execute(async (ctx) => {
      const now = this.clock.now();
      let guestUpdate: { id: string; details: GuestDetails } | undefined;
      // Guest row only; the owner's direct purchase is sub-project 4.
      const view = await runHoldCommand(ctx, input, access, now, HoldPermissions.mayPurchase, async (wishlist, hold) => {
        // Built before anything is written, so an invalid message purchases nothing.
        if (hold.piiRef) {
          const existing = await ctx.guestPii.findById(hold.piiRef.value);
          if (existing) guestUpdate = { id: hold.piiRef.value, details: GuestDetails.from({ name: existing.name, message: input.message }) };
        }
        return wishlist.purchaseHold(hold, input.units);
      });
      if (guestUpdate) await ctx.guestPii.update(guestUpdate.id, guestUpdate.details);
      return view;
    });
  }
}
