import { z } from 'zod';

export const enterGuestKeyRequestSchema = z.object({
  key: z.string().trim().min(1),
});
export type EnterGuestKeyRequest = z.infer<typeof enterGuestKeyRequestSchema>;

export const enterGuestKeyResponseSchema = z.object({
  ok: z.literal(true),
});
export type EnterGuestKeyResponse = z.infer<typeof enterGuestKeyResponseSchema>;
