/**
 * The credentials a request presented for one wishlist, already
 * verified. Built only in presentation/accessContext.ts (authentication is
 * the edge's job) and passed to use cases beside, never inside, the
 * TransactionContext: the transaction is database-scoped, this is
 * request-scoped. The guest session arrives already hashed, so the raw
 * session id never crosses into application/.
 *
 * Structurally a `HoldCredentials` (domain/policies/HoldPermissions), which
 * is how the domain policy reads it.
 */
export interface AccessContext {
  guestSession: { sessionHash: string } | null;
  /** True only for an owner cookie on this list. */
  owner?: boolean;
}
