import type { Actor } from '../../domain/Actor.js';
import type { Hold } from '../../domain/entities/Hold.js';
import type { HoldCommandResult, Wishlist } from '../../domain/entities/Wishlist.js';
import { HoldNotFoundError } from '../../domain/errors.js';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';
import type { AccessContext } from '../AccessContext.js';
import type { TransactionContext } from '../ports/UnitOfWork.js';
import { toHoldView, type HoldView } from '../views/HoldView.js';

export interface HoldCommandInput {
  wishlistId: string;
  holdId: string;
}

/** Extend, release and mark purchased share one shape, so presentation registers their routes alike. */
export interface HoldCommand {
  execute(input: HoldCommandInput, access: AccessContext): Promise<HoldView>;
}

/**
 * The body every hold command shares, run inside a unit of work: load the
 * list, find the hold on it, check permission, let the wishlist decide,
 * then persist the outcome and answer with the hold's view. A command supplies
 * only its permission check and its wishlist call. `now` is the clock reading
 * the list is loaded at; the wishlist then decides everything as of it.
 */
export async function runHoldCommand<E extends LedgerEvent>(
  ctx: TransactionContext,
  input: HoldCommandInput,
  access: AccessContext,
  now: Date,
  permit: (hold: Hold, access: AccessContext) => Actor | null,
  decide: (wishlist: Wishlist, hold: Hold) => HoldCommandResult<E>,
): Promise<HoldView> {
  const wishlist = await ctx.wishlists.findById(input.wishlistId, now);
  if (!wishlist) throw new HoldNotFoundError(input.holdId);
  // Unknown, malformed and another list's hold ids all fail alike (IDOR): the aggregate only finds its own.
  const hold = wishlist.findHold(input.holdId);
  if (!hold) throw new HoldNotFoundError(input.holdId);
  // Not permitted looks exactly like not found: a guest learns nothing
  // about holds that are not theirs.
  const actor = permit(hold, access);
  if (!actor) throw new HoldNotFoundError(input.holdId);

  const { item, event, expectedSeq } = decide(wishlist, hold);

  await ctx.eventStore.append(item.id.value, expectedSeq, [event], actor);
  await ctx.wishlists.save(wishlist);
  return toHoldView(wishlist, hold);
}
