export class DomainValidationError extends Error {}
export class ItemNotFoundError extends Error {
  constructor(itemId: string) { super(`Item not found: ${itemId}`); }
}
export class WishlistNotFoundError extends Error {}
export class ItemAlreadyHeldError extends Error {
  constructor(itemId: string) { super(`Item already held: ${itemId}`); }
}
export class InvalidGuestKeyError extends Error {}
export class ConcurrencyError extends Error {
  constructor(itemId: string, expectedSeq: number, actualSeq: number) {
    super(`Concurrency conflict on item ${itemId}: expected seq ${expectedSeq}, actual ${actualSeq}`);
  }
}
