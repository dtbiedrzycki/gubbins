import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import type { UnitOfWork, TransactionContext } from '../application/ports/UnitOfWork.js';
import { WishlistRepositoryKysely } from './WishlistRepositoryKysely.js';
import { HoldRepositoryKysely } from './HoldRepositoryKysely.js';
import { EventStoreKysely } from './EventStoreKysely.js';

export class UnitOfWorkKysely implements UnitOfWork {
  constructor(private db: Kysely<Database>) {}

  async execute<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return this.db.transaction().execute((trx) => fn({
      wishlists: new WishlistRepositoryKysely(trx),
      holds: new HoldRepositoryKysely(trx),
      eventStore: new EventStoreKysely(trx),
    }));
  }
}
