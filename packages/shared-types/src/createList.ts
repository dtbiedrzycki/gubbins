import { z } from 'zod';

export const createListRequestSchema = z.object({
  listTitle: z.string().trim().min(1).max(120),
  itemTitle: z.string().trim().min(1).max(120),
  createSecret: z.string().optional(),
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
