import type { Actor } from '../../domain/Actor.js';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';

export interface EventStore {
  /**
   * Appends events to itemId's stream, recording `actor` on each row as
   * envelope metadata (ADR-0075) — the role of the credential that
   * authorised the command, which only the use case knows. Throws
   * ConcurrencyError if the stream's current seq !== expectedSeq.
   */
  append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void>;
}
