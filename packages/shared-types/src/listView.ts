import { z } from 'zod';

export const itemStatusSchema = z.enum(['available', 'held']);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const listViewResponseSchema = z.object({
  title: z.string(),
  item: z.object({
    id: z.string(),
    title: z.string(),
    status: itemStatusSchema,
  }),
});
export type ListViewResponse = z.infer<typeof listViewResponseSchema>;
