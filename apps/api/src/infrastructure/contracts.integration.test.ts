import { describeEventStoreContract } from '../application/ports/contracts/eventStore.contract.js';
import { describeHoldRepositoryContract } from '../application/ports/contracts/holdRepository.contract.js';
import { describeWishlistRepositoryContract } from '../application/ports/contracts/wishlistRepository.contract.js';
import type { PersistenceFactory } from '../application/ports/contracts/fixture.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import { EventStoreKysely } from './EventStoreKysely.js';
import { HoldRepositoryKysely } from './HoldRepositoryKysely.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';

const kysely: PersistenceFactory = async () => {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  return {
    wishlists: new WishlistRepositoryKysely(db),
    holds: new HoldRepositoryKysely(db),
    eventStore: new EventStoreKysely(db),
    recordedEvents: async (itemId) => {
      const rows = await db.selectFrom('event_log').select(['event_type', 'actor', 'payload']).where('item_id', '=', itemId).orderBy('seq').execute();
      return rows.map((row) => ({ type: row.event_type, actor: row.actor, payload: JSON.parse(row.payload) as LedgerEvent }));
    },
    dispose: () => db.destroy(),
  };
};

describeWishlistRepositoryContract('Kysely/SQLite', kysely);
describeHoldRepositoryContract('Kysely/SQLite', kysely);
describeEventStoreContract('Kysely/SQLite', kysely);
