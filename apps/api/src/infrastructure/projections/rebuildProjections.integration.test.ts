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
  deps = buildDependencies(db, silent, { clock, createSecret: 'test-create-secret' });
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
    contributions: await db.selectFrom('contributions')
      .select(['id', 'item_id', 'amount_minor', 'session_hash', 'idempotency_key', 'pii_ref', 'pledged_at'])
      .orderBy('id').execute(),
    itemState: await db.selectFrom('item_state').select(['item_id', 'seq']).orderBy('item_id').execute(),
    purchasedCounts: await Promise.all(
      wishlistIds.map(async ({ id }) => {
        const wishlist = await deps.wishlists.findById(id, clock.now());
        return wishlist?.items.map((item) => wishlist.purchasedCountOf(item.id.value));
      }),
    ),
  };
}

async function newList() {
  const { slug } = await deps.createList.execute({ listTitle: 'L', createSecret: 'test-create-secret' });
  const wishlist = await deps.wishlists.findBySlug(slug, clock.now());
  const wishlistId = wishlist!.id.value;
  const { itemId } = await deps.addItem.execute({ wishlistId, type: 'single', title: 'I', quantity: 1 }, { guestSession: null, owner: true });
  const hold = (access: AccessContext, idempotencyKey: string) => deps.holdItem.execute({ wishlistId, itemId, idempotencyKey, name: 'Ada' }, access);
  const command = { wishlistId };
  return { hold, command };
}

async function aGroupGift() {
  const { slug } = await deps.createList.execute({ listTitle: 'G', createSecret: 'test-create-secret', venmoHandle: 'my-venmo' });
  const wishlistId = (await deps.wishlists.findBySlug(slug, clock.now()))!.id.value;
  const { itemId } = await deps.addItem.execute({ wishlistId, type: 'group', title: 'Pram', priceMinor: 50_000 }, { guestSession: null, owner: true });
  const pledge = (access: AccessContext, idempotencyKey: string) =>
    deps.pledgeContribution.execute({ wishlistId, itemId, idempotencyKey, amountMinor: 2_500, name: 'Ada' }, access);
  return { pledge };
}

/** Every event type and every hold state, through the real write path. */
async function aBusyLedger(): Promise<void> {
  const groupGift = await aGroupGift();
  const extendedThenBought = await newList();
  const releasedThenReheld = await newList();
  const lapsedThenBought = await newList();
  const stillActive = await newList();
  await newList(); // a list nobody touched: its item_state must fold back to zero

  const a = await extendedThenBought.hold(GUEST, 'a');
  const b = await releasedThenReheld.hold(GUEST, 'b');
  const c = await lapsedThenBought.hold(GUEST, 'c');
  await stillActive.hold(GUEST, 'd');
  await groupGift.pledge(GUEST, 'p');
  await groupGift.pledge(OTHER_GUEST, 'p2');

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
    await db.deleteFrom('contributions').execute();

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

  it('re-folds piiRef from ItemHeld and leaves guest_pii untouched', async () => {
    const { hold } = await newList();
    const placed = await hold(GUEST, 'k');
    const piiRef = '00000000-0000-7000-8000-00000000aaaa';
    await db.insertInto('guest_pii').values({ id: piiRef, name: 'Guest', message: null, redacted_at: null, created_at: clock.now().toISOString() }).execute();
    const row = await db.selectFrom('event_log').select(['id', 'payload']).executeTakeFirstOrThrow();
    await db.updateTable('event_log').set({ payload: JSON.stringify({ ...JSON.parse(row.payload), piiRef }) }).where('id', '=', row.id).execute();
    // Nothing references this row, so only the snapshot, not a foreign key, would notice a rebuild dropping it.
    await db.insertInto('guest_pii').values({ id: '00000000-0000-7000-8000-00000000dddd', name: 'Unreferenced', message: null, redacted_at: null, created_at: clock.now().toISOString() }).execute();
    const piiBefore = await db.selectFrom('guest_pii').selectAll().execute();

    await rebuildProjections(db);

    expect(await db.selectFrom('holds').select('pii_ref').where('id', '=', placed.holdId).executeTakeFirstOrThrow()).toEqual({ pii_ref: piiRef });
    expect(await db.selectFrom('guest_pii').selectAll().execute()).toEqual(piiBefore);
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
