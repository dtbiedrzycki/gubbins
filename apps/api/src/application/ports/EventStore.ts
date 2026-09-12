export interface DomainEvent {
  type: string;
  occurredAt: string;
  [key: string]: unknown;
}

export interface EventStore {
  /** Appends events to itemId's stream. Throws ConcurrencyError if the stream's current seq !== expectedSeq. */
  append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void>;
}
