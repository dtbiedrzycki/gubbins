import { z } from 'zod';

export const pledgeRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1),
  // Bounds are the domain's: an out-of-range amount is a 409, not a 400.
  amountMinor: z.number().int(),
  name: z.string().trim().min(1).max(100),
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
