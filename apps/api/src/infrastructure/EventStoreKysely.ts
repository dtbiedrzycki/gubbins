import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { EventStore, DomainEvent } from '../application/ports/EventStore.js';
import { ConcurrencyError } from '../domain/errors.js';

export class EventStoreKysely implements EventStore {
  constructor(private db: Kysely<Database>) {}

  async append(itemId: string, expectedSeq: number, events: DomainEvent[]): Promise<void> {
    const countRow = await this.db.selectFrom('event_log')
      .select(({ fn }) => [fn.count<number>('id').as('count')])
      .where('item_id', '=', itemId)
      .executeTakeFirstOrThrow();
    const currentSeq = Number(countRow.count);
    if (currentSeq !== expectedSeq) {
      throw new ConcurrencyError(itemId, expectedSeq, currentSeq);
    }

    let seq = expectedSeq;
    for (const event of events) {
      seq += 1;
      await this.db.insertInto('event_log').values({
        item_id: itemId, seq, event_type: event.type,
        payload: JSON.stringify(event), recorded_at: event.occurredAt,
      }).execute();
    }
  }
}
