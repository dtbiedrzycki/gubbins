export class DomainValidationError extends Error {}
export class ItemNotFoundError extends Error {
  constructor(itemId: string) { super(`Item not found: ${itemId}`); }
}
/**
 * `identifier` is whatever the caller looked the list up by — a slug or an
 * id. A lookup by slug has no id to report.
 */
export class WishlistNotFoundError extends Error {
  constructor(identifier: string) { super(`Wishlist not found: ${identifier}`); }
}
/**
 * No unit of the item is free: active holds and purchases already cover its
 * quantity. Presented as 409 `item_unavailable`.
 */
export class ItemUnavailableError extends Error {
  constructor(itemId: string) { super(`Item unavailable: ${itemId}`); }
}
export class InvalidGuestKeyError extends Error {
  constructor(wishlistId: string) { super(`Invalid guest key for wishlist: ${wishlistId}`); }
}
export class ConcurrencyError extends Error {
  constructor(itemId: string, expectedSeq: number, actualSeq: number) {
    super(`Concurrency conflict on item ${itemId}: expected seq ${expectedSeq}, actual ${actualSeq}`);
  }
}
/**
 * No such hold on this list — or a hold the caller may not act on, which is
 * deliberately the same failure: a guest learns nothing about holds that are
 * not theirs (generic 404, ADR-0016/0054).
 */
export class HoldNotFoundError extends Error {
  constructor(holdId: string) { super(`Hold not found: ${holdId}`); }
}
/** The command needs an active hold and this one has expired, been released, or been purchased. 409 `hold_not_active`. */
export class HoldNotActiveError extends Error {
  constructor(holdId: string) { super(`Hold not active: ${holdId}`); }
}
/** The hold has used its one extension (ADR-0002). 409 `hold_already_extended`. */
export class HoldAlreadyExtendedError extends Error {
  constructor(holdId: string) { super(`Hold already extended: ${holdId}`); }
}
