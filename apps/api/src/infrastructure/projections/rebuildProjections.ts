import { pathToFileURL } from 'node:url';
import { sql, type Kysely } from 'kysely';
import type { LedgerEvent } from '../../domain/events/LedgerEvent.js';
import { createDb } from '../db/createDb.js';
import { inImmediateTransaction } from '../db/immediateTransaction.js';
import { migrateToLatest } from '../db/migrate.js';
import type { Database } from '../db/schema.js';

export class RebuildError extends Error {}

function parse(row: { id: number; event_type: string; payload: string }): LedgerEvent {
  const event = JSON.parse(row.payload) as LedgerEvent;
  if (event.v !== 1) throw new RebuildError(`event_log row ${row.id}: unsupported payload version ${String(event.v)}`);
  if (event.type !== row.event_type) {
    throw new RebuildError(`event_log row ${row.id}: payload type ${event.type} does not match event_type ${row.event_type}`);
  }
  return event;
}

/**
 * Truncates and re-folds the event-derived projections — `holds` and
 * `item_state` — from `event_log`, the source of truth (data & persistence).
 * Minimal by design: tables outside rebuild scope (guest_pii, hold_reminders
 * and the rest, as they arrive) are never touched.
 *
 * One exception: the hold `secret` is in no event (ItemHeld carries only its
 * hash), so it is carried over from the row being replaced. A hold with no
 * row to carry from cannot be rebuilt, and the whole rebuild fails rather
 * than inventing a credential. The exception goes once ItemHeld carries a
 * public key in place of the secret.
 *
 * One BEGIN IMMEDIATE transaction: any failure leaves every projection as
 * it was.
 */
export async function rebuildProjections(db: Kysely<Database>): Promise<{ events: number }> {
  return inImmediateTransaction(db, async (trx) => {
    const secrets = new Map(
      (await trx.selectFrom('holds').select(['id', 'secret']).execute()).map((row) => [row.id, row.secret]),
    );
    await trx.deleteFrom('holds').execute();

    const rows = await trx.selectFrom('event_log').select(['id', 'item_id', 'event_type', 'payload']).orderBy('id').execute();
    for (const row of rows) {
      const event = parse(row);
      switch (event.type) {
        case 'ItemHeld': {
          const secret = secrets.get(event.holdId);
          if (secret === undefined) {
            throw new RebuildError(`hold ${event.holdId}: no projection row to carry its secret over from, and the ledger does not hold it`);
          }
          await trx.insertInto('holds').values({
            id: event.holdId, item_id: row.item_id, secret, session_hash: event.sessionHash,
            idempotency_key: event.idempotencyKey, expires_at: event.expiresAt,
            extended_at: null, released_at: null, purchased_at: null, created_at: event.occurredAt,
          }).execute();
          break;
        }
        case 'HoldExtended':
          await trx.updateTable('holds').set({ expires_at: event.expiresAt, extended_at: event.occurredAt }).where('id', '=', event.holdId).execute();
          break;
        case 'HoldReleased':
          await trx.updateTable('holds').set({ released_at: event.occurredAt }).where('id', '=', event.holdId).execute();
          break;
        case 'ItemPurchased':
          await trx.updateTable('holds').set({ purchased_at: event.occurredAt }).where('id', '=', event.holdId).execute();
          break;
        default: {
          // Exhaustive over LedgerEvent: a new event type fails to compile
          // here until the fold handles it. At runtime, an event_type this
          // build does not know refuses the rebuild.
          const unknown: never = event;
          throw new RebuildError(`event_log row ${row.id}: unknown event type ${String((unknown as { type?: unknown }).type)}`);
        }
      }
    }

    // seq is a pure function of each item's stream; an item with no events
    // folds back to zero. The purchased count is not folded: it is never
    // stored, and loads compute it from the holds re-folded above.
    await sql`
      update item_state set
        seq = (select coalesce(max(seq), 0) from event_log where event_log.item_id = item_state.item_id),
        updated_at = ${new Date().toISOString()}
    `.execute(trx);

    return { events: rows.length };
  });
}

/** CLI: `npm run rebuild-projections`, against DATABASE_PATH. Same library-and-CLI guard as migrate.ts. */
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const db = createDb(process.env.DATABASE_PATH ?? './data/wishlist.db');
  try {
    await migrateToLatest(db);
    const { events } = await rebuildProjections(db);
    console.log(`Rebuilt holds and item_state from ${events} events.`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
