import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb } from '../db/createDb.js';
import { migrateToLatest } from '../db/migrate.js';
import type { Database } from '../db/schema.js';
import { RebuildError, rebuildProjections } from './rebuildProjections.js';
import { buildDependencies, type AppDependencies } from '../../presentation/compositionRoot.js';
import { FixedClock } from '../../application/test-fakes/FixedClock.js';
import type { AccessContext } from '../../application/AccessContext.js';
import type { Logger } from '../../application/ports/Logger.js';

const DAY = 24 * 60 * 60 * 1000;
const GUEST: AccessContext = { guestSession: { sessionHash: 'a'.repeat(64) } };
const OTHER_GUEST: AccessContext = { guestSession: { sessionHash: 'b'.repeat(64) } };
const silent: Logger = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };

let db: Kysely<Database>;
let deps: AppDependencies;
let clock: FixedClock;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrateToLatest(db);
  clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
  deps = buildDependencies(db, silent, { clock });
});

afterEach(async () => {
  await db.destroy();
});

/**
 * The event-derived projections, minus write-time bookkeeping (created_at /
 * updated_at record when a row was written, not a ledger fact), plus each
 * item's purchased count as the loaded aggregate derives it from its purchased
 * holds — it is no column.
 */
async function projections() {
  const wishlistIds = await db.selectFrom('wishlists').select('id').orderBy('id').execute();
  return {
    holds: await db.selectFrom('holds')
      .select(['id', 'item_id', 'secret', 'session_hash', 'idempotency_key', 'expires_at', 'extended_at', 'released_at', 'purchased_at'])
      .orderBy('id').execute(),
    itemState: await db.selectFrom('item_state').select(['item_id', 'seq']).orderBy('item_id').execute(),
    purchasedCounts: await Promise.all(
      wishlistIds.map(async ({ id }) => {
        const wishlist = await deps.wishlists.findById(id, clock.now());
        return wishlist?.item ? wishlist.purchasedCountOf(wishlist.item.id.value) : undefined;
      }),
    ),
  };
}

async function newList() {
  const { slug, itemId } = await deps.createList.execute({ listTitle: 'L', itemTitle: 'I' });
  const wishlist = await deps.wishlists.findBySlug(slug, clock.now());
  const wishlistId = wishlist!.id.value;
  const hold = (access: AccessContext, idempotencyKey: string) => deps.holdItem.execute({ wishlistId, itemId, idempotencyKey }, access);
  const command = { wishlistId };
  return { hold, command };
}

/** Every event type and every hold state, through the real write path. */
async function aBusyLedger(): Promise<void> {
  const extendedThenBought = await newList();
  const releasedThenReheld = await newList();
  const lapsedThenBought = await newList();
  const stillActive = await newList();
  await newList(); // a list nobody touched: its item_state must fold back to zero

  const a = await extendedThenBought.hold(GUEST, 'a');
  const b = await releasedThenReheld.hold(GUEST, 'b');
  const c = await lapsedThenBought.hold(GUEST, 'c');
  await stillActive.hold(GUEST, 'd');

  clock.advance(DAY);
  await deps.extendHold.execute({ ...extendedThenBought.command, holdId: a.holdId }, GUEST);
  await deps.releaseHold.execute({ ...releasedThenReheld.command, holdId: b.holdId }, GUEST);
  await releasedThenReheld.hold(OTHER_GUEST, 'b2');

  clock.advance(DAY);
  await deps.markHoldPurchased.execute({ ...extendedThenBought.command, holdId: a.holdId }, GUEST);

  clock.advance(2 * DAY);
  await deps.markHoldPurchased.execute({ ...lapsedThenBought.command, holdId: c.holdId }, GUEST);
}

describe('rebuildProjections', () => {
  it('re-folds exactly the state the write path maintained incrementally', async () => {
    await aBusyLedger();
    const incremental = await projections();

    const { events } = await rebuildProjections(db);

    expect(await projections()).toEqual(incremental);
    expect(events).toBe((await db.selectFrom('event_log').select('id').execute()).length);
  });

  it('repairs a projection that drifted from the ledger', async () => {
    await aBusyLedger();
    const incremental = await projections();
    await db.updateTable('item_state').set({ seq: 99 }).execute();
    await db.updateTable('holds').set({ released_at: null, purchased_at: null, extended_at: '2000-01-01T00:00:00.000Z' }).execute();

    await rebuildProjections(db);

    expect(await projections()).toEqual(incremental);
  });

  it('refuses, and changes nothing, when a hold has no row to carry its secret over from', async () => {
    await aBusyLedger();
    const [victim] = await db.selectFrom('holds').select('id').execute();
    await db.deleteFrom('holds').where('id', '=', victim.id).execute();
    const before = await projections();

    await expect(rebuildProjections(db)).rejects.toThrow(RebuildError);
    expect(await projections()).toEqual(before);
  });

  it('refuses a payload version it does not know', async () => {
    const { hold } = await newList();
    const placed = await hold(GUEST, 'k');
    const row = await db.selectFrom('event_log').select(['id', 'payload']).executeTakeFirstOrThrow();
    await db.updateTable('event_log').set({ payload: JSON.stringify({ ...JSON.parse(row.payload), v: 2 }) }).where('id', '=', row.id).execute();

    await expect(rebuildProjections(db)).rejects.toThrow(/unsupported payload version 2/);
    expect((await db.selectFrom('holds').select('id').execute()).map((h) => h.id)).toEqual([placed.holdId]);
  });
});
