import { describe, expect, it } from 'vitest';
import { LoggingEventStore } from './LoggingEventStore.js';
import type { EventStore, DomainEvent } from '../application/ports/EventStore.js';
import type { Logger } from '../application/ports/Logger.js';

describe('LoggingEventStore', () => {
  it('delegates to the inner EventStore and logs after a successful append', async () => {
    const appended: [string, number, DomainEvent[]][] = [];
    const inner: EventStore = {
      append: async (itemId, expectedSeq, events) => { appended.push([itemId, expectedSeq, events]); },
    };
    const logs: [string, Record<string, unknown> | undefined][] = [];
    const logger: Logger = { logInfo: (message, meta) => { logs.push([message, meta]); } };
    const decorated = new LoggingEventStore(inner, logger);
    const event: DomainEvent = { type: 'ItemHeld', occurredAt: '2026-01-01T00:00:00.000Z' };

    await decorated.append('i1', 0, [event]);

    expect(appended).toEqual([['i1', 0, [event]]]);
    expect(logs).toEqual([['event_store.append', { itemId: 'i1', expectedSeq: 0, eventTypes: ['ItemHeld'] }]]);
  });

  it('propagates an error from the inner store without logging', async () => {
    const inner: EventStore = { append: async () => { throw new Error('boom'); } };
    const logs: unknown[] = [];
    const logger: Logger = { logInfo: (...args) => { logs.push(args); } };
    const decorated = new LoggingEventStore(inner, logger);

    await expect(decorated.append('i1', 0, [])).rejects.toThrow('boom');
    expect(logs).toHaveLength(0);
  });
});
