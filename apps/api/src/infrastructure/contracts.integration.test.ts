import { describeContributionRepositoryContract } from '../application/ports/contracts/contributionRepository.contract.js';
import { describeEventStoreContract } from '../application/ports/contracts/eventStore.contract.js';
import { describeGuestPiiRepositoryContract } from '../application/ports/contracts/guestPiiRepository.contract.js';
import { describeOwnerPiiRepositoryContract } from '../application/ports/contracts/ownerPiiRepository.contract.js';
import { describeHoldRepositoryContract } from '../application/ports/contracts/holdRepository.contract.js';
import { describeWishlistRepositoryContract } from '../application/ports/contracts/wishlistRepository.contract.js';
import type { PersistenceFactory } from '../application/ports/contracts/fixture.js';
import type { LedgerEvent } from '../domain/events/LedgerEvent.js';
import { createDb } from './db/createDb.js';
import { migrateToLatest } from './db/migrate.js';
import { ContributionRepositoryKysely } from './ContributionRepositoryKysely.js';
import { EventStoreKysely } from './EventStoreKysely.js';
import { GuestPiiRepositoryKysely } from './GuestPiiRepositoryKysely.js';
import { GuestDetails } from '../domain/value-objects/GuestDetails.js';
import { PaymentHandle } from '../domain/value-objects/PaymentHandle.js';
import { HoldRepositoryKysely } from './HoldRepositoryKysely.js';
import { OwnerPiiRepositoryKysely } from './OwnerPiiRepositoryKysely.js';
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
    seedGuestPii: (id) => new GuestPiiRepositoryKysely(db).insert(id, GuestDetails.from({ name: 'Guest' })),
    dispose: () => db.destroy(),
  };
};

describeWishlistRepositoryContract('Kysely/SQLite', kysely);
describeHoldRepositoryContract('Kysely/SQLite', kysely);
describeEventStoreContract('Kysely/SQLite', kysely);
describeGuestPiiRepositoryContract('Kysely/SQLite', async () => {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  return { guestPii: new GuestPiiRepositoryKysely(db), dispose: () => db.destroy() };
});
describeContributionRepositoryContract('Kysely/SQLite', async () => {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  return {
    contributions: new ContributionRepositoryKysely(db), wishlists: new WishlistRepositoryKysely(db),
    seedGuestPii: (id) => new GuestPiiRepositoryKysely(db).insert(id, GuestDetails.from({ name: 'Guest' })),
    seedOwnerPii: (id, wishlistId) => new OwnerPiiRepositoryKysely(db).insert(id, wishlistId, PaymentHandle.from('venmo', 'my-venmo')),
    dispose: () => db.destroy(),
  };
});
describeOwnerPiiRepositoryContract('Kysely/SQLite', async () => {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  const wishlistId = '11111111-1111-7111-8111-111111111111';
  // Each row belongs to a list (a foreign key).
  await db.insertInto('wishlists').values({ id: wishlistId, slug: 's', title: 't', owner_token: 'o', key: 'k', key_gen: 1, created_at: new Date().toISOString() }).execute();
  return { ownerPii: new OwnerPiiRepositoryKysely(db), wishlistId, dispose: () => db.destroy() };
});
