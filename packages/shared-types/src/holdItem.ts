import { z } from 'zod';
import { holdViewSchema, type HoldView } from './holdView.js';

export const holdItemRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  message: z.string().trim().max(300).optional(),
});
export type HoldItemRequest = z.infer<typeof holdItemRequestSchema>;

/** The hold just placed — or, for a replayed idempotency key, the original hold as it is now (ADR-0048). */
export const holdItemResponseSchema = holdViewSchema;
export type HoldItemResponse = HoldView;
