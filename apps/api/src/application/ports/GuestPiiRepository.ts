import type { GuestDetails } from '../../domain/value-objects/GuestDetails.js';

/**
 * A guest's name and message, kept outside the event ledger so they can be
 * erased (ADR-0057). Stored under the `guestPiiRef` id that holds and
 * contributions point at; only a validated `GuestDetails` gets in.
 */
export interface GuestPiiRepository {
  insert(id: string, details: GuestDetails): Promise<void>;
  /** Replaces name and message in place; throws when no row has the id. */
  update(id: string, details: GuestDetails): Promise<void>;
  findById(id: string): Promise<GuestDetails | null>;
  /** Several rows in one read, keyed by id; unknown ids are left out. */
  findByIds(ids: readonly string[]): Promise<Map<string, GuestDetails>>;
}
