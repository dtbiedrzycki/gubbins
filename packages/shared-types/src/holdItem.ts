import { z } from 'zod';

export const holdItemRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1),
});
export type HoldItemRequest = z.infer<typeof holdItemRequestSchema>;

export const holdItemResponseSchema = z.object({
  holdId: z.string(),
  itemId: z.string(),
  expiresAt: z.string(),
});
export type HoldItemResponse = z.infer<typeof holdItemResponseSchema>;
