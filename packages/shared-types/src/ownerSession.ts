import { z } from 'zod';

export const ownerSessionRequestSchema = z.object({
  ownerToken: z.string().min(1),
});
export type OwnerSessionRequest = z.infer<typeof ownerSessionRequestSchema>;

export const ownerSessionResponseSchema = z.object({
  ok: z.literal(true),
});
export type OwnerSessionResponse = z.infer<typeof ownerSessionResponseSchema>;
