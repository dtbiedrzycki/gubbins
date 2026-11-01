import { describe, expect, it } from 'vitest';
import { editListDetailsRequestSchema } from './ownerEditing.js';

describe('editListDetailsRequestSchema', () => {
  it('requires the description, with null to clear it, so a forgotten field is refused rather than wiped', () => {
    expect(editListDetailsRequestSchema.safeParse({ title: 'Baby Shower', description: null }).success).toBe(true);
    expect(editListDetailsRequestSchema.safeParse({ title: 'Baby Shower' }).success).toBe(false);
  });
});
