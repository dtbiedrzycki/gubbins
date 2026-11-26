import { z } from 'zod';

// Capped tightly here: the domain checks only a handle's format, and its email pattern is slow on long input.
export const paymentHandleTextSchema = z.string().max(254);

export const createListRequestSchema = z.object({
  listTitle: z.string().min(1),
  listDescription: z.string().optional(),
  createSecret: z.string().optional(),
  key: z.string(),
  venmoHandle: paymentHandleTextSchema.optional(),
  zelleHandle: paymentHandleTextSchema.optional(),
});
export type CreateListRequest = z.infer<typeof createListRequestSchema>;

export const createListResponseSchema = z.object({
  slug: z.string(),
  ownerToken: z.string(),
  key: z.string(),
});
export type CreateListResponse = z.infer<typeof createListResponseSchema>;

export const guestKeySuggestionResponseSchema = z.object({ key: z.string() });
export type GuestKeySuggestionResponse = z.infer<typeof guestKeySuggestionResponseSchema>;
