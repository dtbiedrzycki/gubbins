import type { GuestDetails } from '../../domain/value-objects/GuestDetails.js';

/**
 * A guest's name and message, kept outside the event ledger so they can be
 * erased (ADR-0057). Stored under the `piiRef` id that holds and
 * contributions point at; only a validated `GuestDetails` gets in.
 */
export interface GuestPiiRepository {
  insert(id: string, details: GuestDetails): Promise<void>;
  findById(id: string): Promise<GuestDetails | null>;
}
