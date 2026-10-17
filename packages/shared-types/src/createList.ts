import { z } from 'zod';
import { text } from './textCeiling.js';

export const createListRequestSchema = z.object({
  listTitle: text().min(1),
  itemTitle: text().min(1),
  createSecret: text().optional(),
  // Capped tightly here: the domain checks only a handle's format, and its email pattern is slow on long input.
  venmoHandle: z.string().max(254).optional(),
  zelleHandle: z.string().max(254).optional(),
});
export type CreateListRequest = z.infer<typeof createListRequestSchema>;

export const createListResponseSchema = z.object({
  slug: z.string(),
  ownerToken: z.string(),
  key: z.string(),
  itemId: z.string(),
});
export type CreateListResponse = z.infer<typeof createListResponseSchema>;
