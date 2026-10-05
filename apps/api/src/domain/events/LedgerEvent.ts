import type { HoldExtendedEvent } from './HoldExtendedEvent.js';
import type { HoldReleasedEvent } from './HoldReleasedEvent.js';
import type { ItemHeldEvent } from './ItemHeldEvent.js';
import type { ItemPurchasedEvent } from './ItemPurchasedEvent.js';

/**
 * Every event an item's stream can carry (ADR-0008). A closed union, so a
 * fold over the ledger — rebuildProjections, the actor matrix test — is
 * checked for exhaustiveness by the compiler when a type is added.
 */
export type LedgerEvent = ItemHeldEvent | HoldExtendedEvent | HoldReleasedEvent | ItemPurchasedEvent;
