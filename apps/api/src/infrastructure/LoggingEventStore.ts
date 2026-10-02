import type { EventStore } from '../application/ports/EventStore.js';
import type { Logger } from '../application/ports/Logger.js';
import type { Actor } from '../domain/Actor.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';

export class LoggingEventStore implements EventStore {
  constructor(
    private inner: EventStore,
    private logger: Logger,
  ) {}

  async append(itemId: string, expectedSeq: number, events: readonly LedgerEvent[], actor: Actor): Promise<void> {
    await this.inner.append(itemId, expectedSeq, events, actor);
    this.logger.logInfo('event_store.append', { itemId, expectedSeq, actor, eventTypes: events.map((e) => e.type) });
  }
}
