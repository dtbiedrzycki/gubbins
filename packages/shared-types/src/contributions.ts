import { z } from 'zod';
import { paymentMethodSchema } from './pledge.js';

/** Who bought, holds and pledged one gift, oldest first; only the owner sees this, and only on request (ADR-0089). */
export const contributionsItemSchema = z.object({
  itemId: z.string(),
  purchases: z.array(z.object({ name: z.string(), message: z.string().nullable(), units: z.number().int().positive(), purchasedAt: z.string() })),
  holds: z.array(z.object({ name: z.string(), units: z.number().int().positive(), expiresAt: z.string() })),
  pledges: z.array(z.object({
    name: z.string(), message: z.string().nullable(), amountMinor: z.number().int().positive(), pledgedAt: z.string(),
    // Where the guest says they paid, and whether that is still the list's handle; null for a pledge made without one.
    payment: z.object({ method: paymentMethodSchema, handle: z.string(), current: z.boolean() }).nullable(),
  })),
});

export const contributionsResponseSchema = z.object({ items: z.array(contributionsItemSchema) });
export type ContributionsResponse = z.infer<typeof contributionsResponseSchema>;
