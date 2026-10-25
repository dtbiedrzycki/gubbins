import { z } from 'zod';

export const pledgeRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
  // Zero or less is never a pledge, so it is a 400 here. The upper bound depends on the item, so it is the domain's 409.
  amountMinor: z.number().int().positive(),
  name: z.string().min(1).max(100),
  message: z.string().max(300).optional(),
});
export type PledgeRequest = z.infer<typeof pledgeRequestSchema>;

/** The pledge just made — or, for a replayed idempotency key, the original. */
export const pledgeResponseSchema = z.object({
  contributionId: z.string(),
  itemId: z.string(),
  amountMinor: z.number().int(),
});
export type PledgeResponse = z.infer<typeof pledgeResponseSchema>;
