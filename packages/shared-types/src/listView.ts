import { z } from 'zod';
import { holdViewSchema } from './holdView.js';

export const itemStatusSchema = z.enum(['available', 'held', 'purchased']);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const listItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['single', 'group']),
  status: itemStatusSchema,
  availableUnits: z.number().int().nonnegative(),
  url: z.string().nullable(),
  priceMinor: z.number().int().nullable(),
  /** Total pledged toward a group gift; null for a single. */
  pledgedMinor: z.number().int().nonnegative().nullable(),
});

export const listViewResponseSchema = z.object({
  title: z.string(),
  item: z.object({
    id: z.string(),
    title: z.string(),
    status: itemStatusSchema,
  }),
  // shortcut: optional until the web reads them; the next task makes both required.
  items: z.array(listItemSchema).optional(),
  /** How guests pay for a group gift. */
  payment: z.object({ venmoHandle: z.string().nullable(), zelleHandle: z.string().nullable() }).optional(),
  /** This session's holds on the list, oldest expiry first. Released holds are left out. */
  myHolds: z.array(holdViewSchema),
  /** What this server does for guests (ops: capability flags). */
  capabilities: z.object({ holdDurationDays: z.number().int().positive() }),
});
export type ListViewResponse = z.infer<typeof listViewResponseSchema>;
