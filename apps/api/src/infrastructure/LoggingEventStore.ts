import type { EventStore, DomainEvent } from '../application/ports/EventStore.js';
import type { Logger } from '../application/ports/Logger.js';

export class LoggingEventStore implements EventStore {
  constructor(
    private inner: EventStore,
    private logger: Logger,
  ) {}

  async append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void> {
    await this.inner.append(itemId, expectedSeq, events);
    this.logger.logInfo('event_store.append', { itemId, expectedSeq, eventTypes: events.map((e) => e.type) });
  }
}
