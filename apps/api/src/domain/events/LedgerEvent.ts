import type { ContributionPledgedEvent } from './ContributionPledgedEvent.js';
import type { HoldExtendedEvent } from './HoldExtendedEvent.js';
import type { HoldReleasedEvent } from './HoldReleasedEvent.js';
import type { ItemHeldEvent } from './ItemHeldEvent.js';
import type { ItemPurchasedEvent } from './ItemPurchasedEvent.js';

/**
 * Every event an item's stream can carry (ADR-0008). A closed union, so a
 * fold over the ledger — rebuildProjections, the actor matrix test — is
 * checked for exhaustiveness by the compiler when a type is added.
 */
export type LedgerEvent = ItemHeldEvent | HoldExtendedEvent | HoldReleasedEvent | ItemPurchasedEvent | ContributionPledgedEvent;

// Names and messages are PII and live only behind piiRef: the build fails if any event grows either key.
type PiiKeys<E> = E extends unknown ? Extract<keyof E, 'name' | 'message'> : never;
export const ledgerEventsCarryNoPii: [PiiKeys<LedgerEvent>] extends [never] ? true : false = true;
