import { describe, expect, it } from 'vitest';
import { editListDetailsRequestSchema, moveItemRequestSchema } from './ownerEditing.js';

describe('editListDetailsRequestSchema', () => {
  it('requires the description, with null to clear it, so a forgotten field is refused rather than wiped', () => {
    expect(editListDetailsRequestSchema.safeParse({ title: 'Baby Shower', description: null }).success).toBe(true);
    expect(editListDetailsRequestSchema.safeParse({ title: 'Baby Shower' }).success).toBe(false);
  });
});

describe('moveItemRequestSchema', () => {
  it('accepts each move target and refuses any other', () => {
    for (const to of ['top', 'up', 'down', 'bottom']) expect(moveItemRequestSchema.safeParse({ to }).success).toBe(true);
    expect(moveItemRequestSchema.safeParse({ to: 'first' }).success).toBe(false);
    expect(moveItemRequestSchema.safeParse({}).success).toBe(false);
  });
});
