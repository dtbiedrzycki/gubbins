import { z } from 'zod';

export const instanceResponseSchema = z.object({
  sourceUrl: z.string(),
  privacyContact: z.string().nullable(),
});
export type InstanceResponse = z.infer<typeof instanceResponseSchema>;
