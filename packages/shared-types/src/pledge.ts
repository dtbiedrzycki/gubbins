import { z } from 'zod';
import { paymentHandleTextSchema } from './createList.js';

/** The ways a guest can pay for a group gift. */
export const paymentMethodSchema = z.enum(['venmo', 'zelle']);

export const pledgeRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  // Zero or less is never a pledge, so it is a 400 here. The upper bound depends on the item, so it is the domain's 409.
  amountMinor: z.number().int().positive(),
  name: z.string().min(1),
  message: z.string().optional(),
  // The method and handle the guest says they paid. Optional: a pledge can be recorded without one, and older pages send none.
  payment: z.object({ method: paymentMethodSchema, handle: paymentHandleTextSchema }).optional(),
});
export type PledgeRequest = z.infer<typeof pledgeRequestSchema>;

/** The pledge just made — or, for a replayed idempotency key, the original. */
export const pledgeResponseSchema = z.object({
  contributionId: z.string(),
  itemId: z.string(),
  amountMinor: z.number().int(),
});
export type PledgeResponse = z.infer<typeof pledgeResponseSchema>;
