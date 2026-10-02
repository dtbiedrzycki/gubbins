import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyError } from '../../../domain/errors.js';
import type { HoldReleasedEvent } from '../../../domain/events/HoldReleasedEvent.js';
import { anItemHeldEvent } from '../../test-fakes/builders.js';
import { ITEM_A, ITEM_B, type PersistenceFactory, type PersistenceFixture } from './fixture.js';

const released = (holdId: string): HoldReleasedEvent => ({ type: 'HoldReleased', v: 1, holdId, occurredAt: '2026-01-02T00:00:00.000Z' });

export function describeEventStoreContract(adapter: string, factory: PersistenceFactory): void {
  describe(`EventStore contract (${adapter})`, () => {
    let fx: PersistenceFixture;
    beforeEach(async () => { fx = await factory(); });
    afterEach(async () => { await fx.dispose(); });

    it('appends at the stream length, recording each event with its actor', async () => {
      const held = anItemHeldEvent({ itemId: ITEM_A });
      await fx.eventStore.append(ITEM_A, 0, [held], 'guest');
      await fx.eventStore.append(ITEM_A, 1, [released(held.holdId)], 'guest');

      expect(await fx.recordedEvents(ITEM_A)).toEqual([
        { type: 'ItemHeld', actor: 'guest', payload: held },
        { type: 'HoldReleased', actor: 'guest', payload: released(held.holdId) },
      ]);
    });

    it('appends several events in one call, in order', async () => {
      const held = anItemHeldEvent({ itemId: ITEM_A });
      await fx.eventStore.append(ITEM_A, 0, [held, released(held.holdId)], 'guest');
      expect((await fx.recordedEvents(ITEM_A)).map((e) => e.type)).toEqual(['ItemHeld', 'HoldReleased']);
    });

    it('throws ConcurrencyError on a stale expectedSeq and writes nothing', async () => {
      await fx.eventStore.append(ITEM_A, 0, [anItemHeldEvent({ itemId: ITEM_A })], 'guest');

      await expect(fx.eventStore.append(ITEM_A, 0, [released('x')], 'guest')).rejects.toThrow(ConcurrencyError);
      expect(await fx.recordedEvents(ITEM_A)).toHaveLength(1);
    });

    it('keeps each item its own stream (ADR-0008)', async () => {
      await fx.eventStore.append(ITEM_A, 0, [anItemHeldEvent({ itemId: ITEM_A })], 'guest');
      await fx.eventStore.append(ITEM_B, 0, [anItemHeldEvent({ itemId: ITEM_B })], 'guest');
      expect(await fx.recordedEvents(ITEM_B)).toHaveLength(1);
    });

    it('keeps the actor out of the payload: it is envelope metadata (ADR-0075)', async () => {
      await fx.eventStore.append(ITEM_A, 0, [anItemHeldEvent({ itemId: ITEM_A })], 'guest');
      const [recorded] = await fx.recordedEvents(ITEM_A);
      expect(recorded.payload).not.toHaveProperty('actor');
      expect(recorded.payload).toMatchObject({ v: 1 });
    });
  });
}
