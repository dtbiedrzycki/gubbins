import type { Migration } from 'kysely/migration';
import { up as init } from './0001_init.js';

/** Every migration, in the order they run. A released migration is never edited: add the next one here instead. */
export const migrations: Record<string, Migration> = {
  '0001_init': { up: init },
};
