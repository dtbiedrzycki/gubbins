import { z } from 'zod';

export const editListDetailsRequestSchema = z.object({ title: z.string().min(1), description: z.string().optional() });
export type EditListDetailsRequest = z.infer<typeof editListDetailsRequestSchema>;

export const editedResponseSchema = z.object({ ok: z.literal(true) });
export type EditedResponse = z.infer<typeof editedResponseSchema>;
