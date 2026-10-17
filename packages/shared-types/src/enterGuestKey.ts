import { z } from 'zod';
import { text } from './textCeiling.js';

export const enterGuestKeyRequestSchema = z.object({
  key: text().min(1),
});
export type EnterGuestKeyRequest = z.infer<typeof enterGuestKeyRequestSchema>;

export const enterGuestKeyResponseSchema = z.object({
  ok: z.literal(true),
});
export type EnterGuestKeyResponse = z.infer<typeof enterGuestKeyResponseSchema>;
