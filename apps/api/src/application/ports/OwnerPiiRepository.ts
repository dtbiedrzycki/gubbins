import type { PaymentHandle } from '../../domain/value-objects/PaymentHandle.js';

/**
 * The handle a pledge names, kept as owner PII outside the event ledger,
 * one row per pledge (ADR-0090). Stored under the `ownerPiiRef` id the
 * contribution points at; only a checked `PaymentHandle` gets in.
 */
export interface OwnerPiiRepository {
  insert(id: string, wishlistId: string, payment: PaymentHandle): Promise<void>;
  /** Several rows in one read, keyed by id; unknown ids are left out. */
  findByIds(ids: readonly string[]): Promise<Map<string, PaymentHandle>>;
}
