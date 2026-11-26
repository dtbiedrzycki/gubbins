import type { Migration } from 'kysely/migration';
import { up as init } from './0001_init.js';
import { up as itemPositions } from './0002_item_positions.js';
import { up as itemsWishlistIndex } from './0003_items_wishlist_index.js';
import { up as wishlistTheme } from './0004_wishlist_theme.js';
import { up as holdBuyUndone } from './0005_hold_buy_undone.js';
import { up as guestPiiRef } from './0006_guest_pii_ref.js';

/** Every migration, in the order they run. A released migration is never edited: add the next one here instead. */
export const migrations: Record<string, Migration> = {
  '0001_init': { up: init },
  '0002_item_positions': { up: itemPositions },
  '0003_items_wishlist_index': { up: itemsWishlistIndex },
  '0004_wishlist_theme': { up: wishlistTheme },
  '0005_hold_buy_undone': { up: holdBuyUndone },
  '0006_guest_pii_ref': { up: guestPiiRef },
};
