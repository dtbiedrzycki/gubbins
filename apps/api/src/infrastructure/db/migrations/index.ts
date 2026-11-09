import type { Migration } from 'kysely/migration';
import { up as init } from './0001_init.js';
import { up as clearHoldMessages } from './0002_clear_hold_messages.js';

/** Every migration, in the order they run. A released migration is never edited: add the next one here instead. */
export const migrations: Record<string, Migration> = {
  '0001_init': { up: init },
  '0002_clear_hold_messages': { up: clearHoldMessages },
};
