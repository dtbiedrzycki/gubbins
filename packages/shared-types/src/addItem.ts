import { z } from 'zod';

const httpsUrl = z.url({ protocol: /^https$/ });
const priceMinor = z.number().int().positive().max(10 ** 12);

export const addItemRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single'),
    title: z.string().min(1),
    description: z.string().optional(),
    // Near-arbitrary cap to catch an accidentally large quantity; not a product rule.
    quantity: z.number().int().min(1).max(99).default(1),
    url: httpsUrl.optional(),
    priceMinor: priceMinor.optional(),
  }),
  z.object({
    type: z.literal('group'),
    title: z.string().min(1),
    description: z.string().optional(),
    url: httpsUrl.optional(),
    priceMinor,
  }),
]);
export type AddItemRequest = z.infer<typeof addItemRequestSchema>;

export const editItemRequestSchema = z.object({
  title: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  priceMinor: priceMinor.optional(),
  url: httpsUrl.optional(),
  description: z.string().optional(),
});
export type EditItemRequest = z.infer<typeof editItemRequestSchema>;

export const addItemResponseSchema = z.object({ itemId: z.string() });
export type AddItemResponse = z.infer<typeof addItemResponseSchema>;
