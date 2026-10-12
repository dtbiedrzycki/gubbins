import { HoldPermissions } from '../../domain/policies/HoldPermissions.js';
import type { AccessContext } from '../AccessContext.js';
import { holdDurationMs, type HoldPolicy } from '../HoldPolicy.js';
import type { Clock } from '../ports/Clock.js';
import type { UnitOfWork } from '../ports/UnitOfWork.js';
import type { HoldView } from '../views/HoldView.js';
import { runHoldCommand, type HoldCommand, type HoldCommandInput } from './holdCommand.js';

export class ExtendHold implements HoldCommand {
  constructor(
    private unitOfWork: UnitOfWork,
    private clock: Clock,
    private policy: HoldPolicy,
  ) {}

  async execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView> {
    return this.unitOfWork.execute((ctx) => {
      const now = this.clock.now();
      return runHoldCommand(ctx, input, access, now, HoldPermissions.mayExtend, (wishlist, hold) =>
        wishlist.extendHold(hold, holdDurationMs(this.policy)),
      );
    });
  }
}
