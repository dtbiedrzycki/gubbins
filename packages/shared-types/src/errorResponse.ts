import { z } from 'zod';

export const errorResponseSchema = z.object({
  message: z.string(),
  issues: z.array(z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
