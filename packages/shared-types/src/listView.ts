import { z } from 'zod';
import { holdViewSchema } from './holdView.js';

/** The list's style, which the owner picks. */
export const listThemeSchema = z.enum(['storybook', 'groovy']);
export type ListTheme = z.infer<typeof listThemeSchema>;

export const itemStatusSchema = z.enum(['available', 'held', 'purchased']);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const listItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['single', 'group']),
  status: itemStatusSchema,
  availableUnits: z.number().int().nonnegative(),
  url: z.string().nullable(),
  description: z.string().nullable(),
  priceMinor: z.number().int().nullable(),
  /** Total pledged toward a group gift; null for a single. */
  pledgedMinor: z.number().int().nonnegative().nullable(),
});

/**
 * One of this guest's pledges toward a group gift. Names, messages and payment details are
 * deliberately left out: the guest sees amounts and times, nothing about anyone else.
 */
export const contributionViewSchema = z.object({
  contributionId: z.string(),
  itemId: z.string(),
  amountMinor: z.number().int().positive(),
  pledgedAt: z.string(),
});

export const listViewResponseSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  theme: listThemeSchema,
  items: z.array(listItemSchema),
  /** How guests pay for a group gift. */
  payment: z.object({ venmoHandle: z.string().nullable(), zelleHandle: z.string().nullable() }),
  /** This session's holds on the list, oldest expiry first. Released holds are left out. */
  myHolds: z.array(holdViewSchema),
  /** This session's pledges on the list, newest first. */
  myContributions: z.array(contributionViewSchema),
  /** What this server does for guests (ops: capability flags). */
  capabilities: z.object({ holdDurationDays: z.number().int().positive() }),
});
export type ListViewResponse = z.infer<typeof listViewResponseSchema>;
