import { z } from 'zod';
import { text } from './textCeiling.js';

export const ownerSessionRequestSchema = z.object({
  ownerToken: text().min(1),
});
export type OwnerSessionRequest = z.infer<typeof ownerSessionRequestSchema>;

export const ownerSessionResponseSchema = z.object({
  ok: z.literal(true),
});
export type OwnerSessionResponse = z.infer<typeof ownerSessionResponseSchema>;
