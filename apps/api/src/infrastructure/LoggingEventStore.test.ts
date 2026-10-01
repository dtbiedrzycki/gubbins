import { describe, expect, it } from 'vitest';
import { LoggingEventStore } from './LoggingEventStore.js';
import type { EventStore } from '../application/ports/EventStore.js';
import type { Logger } from '../application/ports/Logger.js';
import type { Actor } from '../domain/Actor.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import { anItemHeldEvent } from '../application/test-fakes/builders.js';

describe('LoggingEventStore', () => {
  it('delegates to the inner EventStore and logs after a successful append, actor included', async () => {
    const appended: [string, number, readonly LedgerEvent[], Actor][] = [];
    const inner: EventStore = {
      append: async (itemId, expectedSeq, events, actor) => { appended.push([itemId, expectedSeq, events, actor]); },
    };
    const logs: [string, Record<string, unknown> | undefined][] = [];
    const logger: Logger = { logInfo: (message, meta) => { logs.push([message, meta]); }, logWarn: () => {}, logError: () => {} };
    const decorated = new LoggingEventStore(inner, logger);
    const event = anItemHeldEvent();

    await decorated.append('i1', 0, [event], 'guest');

    expect(appended).toEqual([['i1', 0, [event], 'guest']]);
    expect(logs).toEqual([['event_store.append', { itemId: 'i1', expectedSeq: 0, actor: 'guest', eventTypes: ['ItemHeld'] }]]);
  });

  it('propagates an error from the inner store without logging', async () => {
    const inner: EventStore = { append: async () => { throw new Error('boom'); } };
    const logs: unknown[] = [];
    const logger: Logger = { logInfo: (...args) => { logs.push(args); }, logWarn: () => {}, logError: () => {} };
    const decorated = new LoggingEventStore(inner, logger);

    await expect(decorated.append('i1', 0, [], 'guest')).rejects.toThrow('boom');
    expect(logs).toHaveLength(0);
  });
});
