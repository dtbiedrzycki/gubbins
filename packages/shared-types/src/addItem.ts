import { z } from 'zod';
import { TEXT_CEILING, text } from './textCeiling.js';

const httpsUrl = z.url({ protocol: /^https$/ }).max(TEXT_CEILING);
const priceMinor = z.number().int().positive().max(10 ** 12);

export const addItemRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single'),
    title: text().min(1),
    // Near-arbitrary cap to catch an accidentally large quantity; not a product rule.
    quantity: z.number().int().min(1).max(99).default(1),
    url: httpsUrl.optional(),
    priceMinor: priceMinor.optional(),
  }),
  z.object({
    type: z.literal('group'),
    title: text().min(1),
    url: httpsUrl.optional(),
    priceMinor,
  }),
]);
export type AddItemRequest = z.infer<typeof addItemRequestSchema>;

export const addItemResponseSchema = z.object({ itemId: z.string() });
export type AddItemResponse = z.infer<typeof addItemResponseSchema>;
