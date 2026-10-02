import type { Kysely } from 'kysely';
import type { Database } from '../infrastructure/db/schema.js';
import { UnitOfWorkKysely } from '../infrastructure/UnitOfWorkKysely.js';
import { WishlistRepositoryKysely } from '../infrastructure/WishlistRepositoryKysely.js';
import { ClockSystem } from '../infrastructure/ClockSystem.js';
import { TokenGeneratorCrypto } from '../infrastructure/TokenGeneratorCrypto.js';
import { SecretComparerCrypto } from '../infrastructure/SecretComparerCrypto.js';
import { HasherSha256 } from '../infrastructure/HasherSha256.js';
import { ConsoleLogger } from '../infrastructure/ConsoleLogger.js';
import { LoggingEventStore } from '../infrastructure/LoggingEventStore.js';
import { CreateList } from '../application/use-cases/CreateList.js';
import { EnterGuestKey } from '../application/use-cases/EnterGuestKey.js';
import { HoldItem } from '../application/use-cases/HoldItem.js';
import type { Logger } from '../application/ports/Logger.js';
import type { Clock } from '../application/ports/Clock.js';

export interface AppDependencies {
  createList: CreateList;
  enterGuestKey: EnterGuestKey;
  holdItem: HoldItem;
  wishlists: WishlistRepositoryKysely;
  logger: Logger;
  clock: Clock;
}

export function buildDependencies(db: Kysely<Database>, logger: Logger = new ConsoleLogger()): AppDependencies {
  const unitOfWork = new UnitOfWorkKysely(db, (base) => new LoggingEventStore(base, logger));
  const tokenGenerator = new TokenGeneratorCrypto();
  const clock = new ClockSystem();
  const hasher = new HasherSha256();
  const secretComparer = new SecretComparerCrypto();
  const wishlists = new WishlistRepositoryKysely(db);

  return {
    createList: new CreateList(unitOfWork, tokenGenerator),
    enterGuestKey: new EnterGuestKey(wishlists, secretComparer, tokenGenerator, clock),
    holdItem: new HoldItem(unitOfWork, tokenGenerator, clock, hasher),
    wishlists,
    logger,
    clock,
  };
}
