import { z } from 'zod';

export const manageItemSchema = z.object({
  id: z.string(),
  type: z.enum(['single', 'group']),
  title: z.string(),
  quantity: z.number().int().positive(),
  priceMinor: z.number().int().nullable(),
  url: z.string().nullable(),
  description: z.string().nullable(),
  /** True while no guest has acted on it; only then may it be deleted. */
  deletable: z.boolean(),
  committedUnits: z.number().int().nonnegative(),
  /** Sum of pledges for a group gift; null for a single. */
  pledgedMinor: z.number().int().nonnegative().nullable(),
});

export const manageViewResponseSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  /** The guest key, shown to the owner so they can share it. */
  key: z.string(),
  items: z.array(manageItemSchema),
});
export type ManageViewResponse = z.infer<typeof manageViewResponseSchema>;
