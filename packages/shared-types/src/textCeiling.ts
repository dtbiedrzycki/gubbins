import { z } from 'zod';

/**
 * Text the domain sizes: the exact limit is the domain's, so this only turns away a value far past
 * any of them before work is done on it.
 */
export const TEXT_CEILING = 10_000;

export const text = () => z.string().max(TEXT_CEILING);
