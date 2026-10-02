import { HoldPermissions } from '../../domain/policies/HoldPermissions.js';
import type { AccessContext } from '../AccessContext.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { HoldView } from '../views/HoldView.js';
import { runHoldCommand, type HoldCommand, type HoldCommandInput } from './holdCommand.js';

export class ReleaseHold implements HoldCommand {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
  ) {}

  async execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> {
    return this.unitOfWork.execute((ctx) => {
      const now = this.clock.now();
      // Guest row only in stack A; stack F adds the owner's, gated on
      // claim-status visibility.
      return runHoldCommand(ctx, input, access, now, HoldPermissions.mayRelease, (wishlist, hold) => wishlist.releaseHold(hold));
    });
  }
}
