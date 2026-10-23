import { z } from 'zod';

/**
 * Every text field in a request except the payment handles, which `createList.ts` caps tighter: the
 * domain owns the exact lengths, so this only turns away a value far past any of them, before work
 * is done on it.
 */
export const TEXT_CEILING = 10_000;

export const text = () => z.string().max(TEXT_CEILING);
