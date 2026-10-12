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

  async execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> {
    return this.unitOfWork.execute((ctx) => {
      const now = this.clock.now();
      // Guest row only; the owner's direct purchase is sub-project 4.
      return runHoldCommand(ctx, input, access, now, HoldPermissions.mayPurchase, (wishlist, hold) => wishlist.purchaseHold(hold));
    });
  }
}
