import type { Kysely } from 'kysely';
import type { Database } from '../infrastructure/db/schema.js';
import { UnitOfWorkKysely } from '../infrastructure/UnitOfWorkKysely.js';
import { WishlistRepositoryKysely } from '../infrastructure/WishlistRepositoryKysely.js';
import { ItemRepositoryKysely } from '../infrastructure/ItemRepositoryKysely.js';
import { ClockSystem } from '../infrastructure/ClockSystem.js';
import { TokenGeneratorCrypto } from '../infrastructure/TokenGeneratorCrypto.js';
import { SecretComparerCrypto } from '../infrastructure/SecretComparerCrypto.js';
import { HasherSha256 } from '../infrastructure/HasherSha256.js';
import { ConsoleLogger } from '../infrastructure/ConsoleLogger.js';
import { LoggingEventStore } from '../infrastructure/LoggingEventStore.js';
import { CreateList } from '../application/use-cases/CreateList.js';
import { EnterGuestKey } from '../application/use-cases/EnterGuestKey.js';
import { HoldItem } from '../application/use-cases/HoldItem.js';

export interface AppDependencies {
  createList: CreateList;
  enterGuestKey: EnterGuestKey;
  holdItem: HoldItem;
  wishlists: WishlistRepositoryKysely;
  items: ItemRepositoryKysely;
}

export function buildDependencies(db: Kysely<Database>): AppDependencies {
  const logger = new ConsoleLogger();
  const unitOfWork = new UnitOfWorkKysely(db, (base) => new LoggingEventStore(base, logger));
  const tokenGenerator = new TokenGeneratorCrypto();
  const clock = new ClockSystem();
  const hasher = new HasherSha256();
  const secretComparer = new SecretComparerCrypto();
  const wishlists = new WishlistRepositoryKysely(db);
  const items = new ItemRepositoryKysely(db);

  return {
    createList: new CreateList(unitOfWork, tokenGenerator),
    enterGuestKey: new EnterGuestKey(wishlists, secretComparer, tokenGenerator),
    holdItem: new HoldItem(unitOfWork, tokenGenerator, clock, hasher),
    wishlists,
    items,
  };
}
