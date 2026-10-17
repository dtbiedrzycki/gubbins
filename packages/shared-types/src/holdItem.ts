import { z } from 'zod';
import { text } from './textCeiling.js';
import { holdViewSchema, type HoldView } from './holdView.js';

export const holdItemRequestSchema = z.object({
  idempotencyKey: text().min(1),
  name: text().min(1),
  message: text().optional(),
});
export type HoldItemRequest = z.infer<typeof holdItemRequestSchema>;

/** The hold just placed — or, for a replayed idempotency key, the original hold as it is now (ADR-0048). */
export const holdItemResponseSchema = holdViewSchema;
export type HoldItemResponse = HoldView;
