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
  units: z.number().int().min(1),
  purchasedUnits: z.number().int().min(1).nullable(),
  purchasableUnits: z.number().int().min(0),
  actions: z.object({ extend: z.boolean(), release: z.boolean(), purchase: z.boolean() }),
});
export type HoldView = z.infer<typeof holdViewSchema>;

/** How many of the held units were bought, and an optional message to the owner. */
export const markHoldPurchasedRequestSchema = z.object({ units: z.number().int().min(1), message: z.string().optional() });
export type MarkHoldPurchasedRequest = z.infer<typeof markHoldPurchasedRequestSchema>;
