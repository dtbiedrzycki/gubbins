import type { Kysely } from 'kysely';
import type { Database } from '../infrastructure/db/schema.js';
import { RetryingUnitOfWork } from '../application/RetryingUnitOfWork.js';
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
import { EnterOwnerToken } from '../application/use-cases/EnterOwnerToken.js';
import { GetListView } from '../application/use-cases/GetListView.js';
import { AddItem } from '../application/use-cases/AddItem.js';
import { HoldItem } from '../application/use-cases/HoldItem.js';
import { PledgeContribution } from '../application/use-cases/PledgeContribution.js';
import { ExtendHold } from '../application/use-cases/ExtendHold.js';
import { ReleaseHold } from '../application/use-cases/ReleaseHold.js';
import { MarkHoldPurchased } from '../application/use-cases/MarkHoldPurchased.js';
import type { Logger } from '../application/ports/Logger.js';
import type { Clock } from '../application/ports/Clock.js';
import type { Hasher } from '../application/ports/Hasher.js';
import { DEFAULT_HOLD_POLICY, type HoldPolicy } from '../application/HoldPolicy.js';
import { DEFAULT_INSTANCE_CONFIG, type InstanceConfig } from './instanceConfig.js';

export interface BuildDependenciesOptions {
  /** Defaults to the system clock; integration tests pass a FixedClock to step through expiry. */
  clock?: Clock;
  /** Validated from HOLD_DURATION_DAYS by the server (holdPolicyConfig.ts); defaults to 3 days. */
  holdPolicy?: HoldPolicy;
  /** Validated from CREATE_SECRET by the server; when absent, every list creation is refused. */
  createSecret?: string;
  /** Defaults to the upstream source URL and no privacy contact. */
  instance?: InstanceConfig;
}

export interface AppDependencies {
  createList: CreateList;
  enterGuestKey: EnterGuestKey;
  enterOwnerToken: EnterOwnerToken;
  getListView: GetListView;
  addItem: AddItem;
  holdItem: HoldItem;
  pledgeContribution: PledgeContribution;
  extendHold: ExtendHold;
  releaseHold: ReleaseHold;
  markHoldPurchased: MarkHoldPurchased;
  /** For resolving a URL's slug before access is checked; use cases load their own aggregate. */
  wishlists: WishlistRepositoryKysely;
  logger: Logger;
  clock: Clock;
  hasher: Hasher;
  instance: InstanceConfig;
}

export function buildDependencies(db: Kysely<Database>, logger: Logger = new ConsoleLogger(), options: BuildDependenciesOptions = {}): AppDependencies {
  const unitOfWork = new RetryingUnitOfWork(new UnitOfWorkKysely(db, (base) => new LoggingEventStore(base, logger)), logger);
  const tokenGenerator = new TokenGeneratorCrypto();
  const clock = options.clock ?? new ClockSystem();
  const holdPolicy = options.holdPolicy ?? DEFAULT_HOLD_POLICY;
  const hasher = new HasherSha256();
  const secretComparer = new SecretComparerCrypto();
  const wishlists = new WishlistRepositoryKysely(db);

  return {
    createList: new CreateList(unitOfWork, tokenGenerator, clock, secretComparer, options.createSecret ?? null),
    enterGuestKey: new EnterGuestKey(wishlists, secretComparer, tokenGenerator, clock),
    enterOwnerToken: new EnterOwnerToken(wishlists, secretComparer, clock),
    getListView: new GetListView(unitOfWork, clock, holdPolicy),
    addItem: new AddItem(unitOfWork, tokenGenerator, clock),
    holdItem: new HoldItem(unitOfWork, tokenGenerator, clock, hasher, holdPolicy),
    pledgeContribution: new PledgeContribution(unitOfWork, tokenGenerator, clock),
    extendHold: new ExtendHold(unitOfWork, clock, holdPolicy),
    releaseHold: new ReleaseHold(unitOfWork, clock),
    markHoldPurchased: new MarkHoldPurchased(unitOfWork, clock),
    wishlists,
    logger,
    clock,
    hasher,
    instance: options.instance ?? DEFAULT_INSTANCE_CONFIG,
  };
}
