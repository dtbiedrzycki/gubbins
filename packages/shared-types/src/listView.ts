import { z } from 'zod';
import { holdViewSchema } from './holdView.js';

export const itemStatusSchema = z.enum(['available', 'held', 'purchased']);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const listViewResponseSchema = z.object({
  title: z.string(),
  item: z.object({
    id: z.string(),
    title: z.string(),
    status: itemStatusSchema,
  }),
  /** This session's holds on the list, oldest expiry first. Released holds are left out. */
  myHolds: z.array(holdViewSchema),
  /** What this server does for guests (ops: capability flags). */
  capabilities: z.object({ holdDurationDays: z.number().int().positive() }),
});
export type ListViewResponse = z.infer<typeof listViewResponseSchema>;
