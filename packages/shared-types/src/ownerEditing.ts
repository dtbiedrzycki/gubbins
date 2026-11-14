import { z } from 'zod';
import { listThemeSchema } from './listView.js';

// Required and null to clear: a save replaces every detail, so a forgotten field is refused, not wiped.
export const editListDetailsRequestSchema = z.object({ title: z.string().min(1), description: z.string().nullable(), theme: listThemeSchema });
export type EditListDetailsRequest = z.infer<typeof editListDetailsRequestSchema>;

export const editedResponseSchema = z.object({ ok: z.literal(true) });
export type EditedResponse = z.infer<typeof editedResponseSchema>;

export const moveItemRequestSchema = z.object({ to: z.enum(['top', 'up', 'down', 'bottom']) });
export type MoveItemRequest = z.infer<typeof moveItemRequestSchema>;
