import { z } from 'zod';

export const holdStatusSchema = z.enum(['active', 'expired', 'released', 'purchased']);
export type HoldStatus = z.infer<typeof holdStatusSchema>;

/**
 * A hold as its own guest sees it. `actions` are decided by the server's
 * domain — the client shows exactly those and never re-derives a rule.
 */
export const holdViewSchema = z.object({
  holdId: z.string(),
  itemId: z.string(),
  status: holdStatusSchema,
  expiresAt: z.string(),
  extendedAt: z.string().nullable(),
  actions: z.object({ extend: z.boolean(), release: z.boolean(), purchase: z.boolean() }),
});
export type HoldView = z.infer<typeof holdViewSchema>;
