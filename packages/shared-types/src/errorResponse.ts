import { z } from 'zod';

/**
 * Machine-readable reasons for a 409, so the client can branch without
 * parsing the human message. More codes are added as the features that
 * raise them land.
 */
export const errorCodeSchema = z.enum(['item_unavailable', 'hold_not_active', 'hold_already_extended', 'no_payment_method', 'amount_out_of_range', 'item_has_guest_history']);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  message: z.string(),
  code: errorCodeSchema.optional(),
  issues: z.array(z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
