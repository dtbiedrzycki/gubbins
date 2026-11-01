import { describe, expect, it } from 'vitest';
import { addItemRequestSchema, editItemRequestSchema } from './addItem.js';

describe('addItemRequestSchema', () => {
  it.each([
    { type: 'single', title: 'Cot' },
    { type: 'group', title: 'Pram', priceMinor: 30000 },
  ])('keeps the description of a $type item', (item) => {
    const request = addItemRequestSchema.parse({ ...item, description: 'The grey one' });
    expect(request.description).toBe('The grey one');
  });
});

describe('editItemRequestSchema', () => {
  const cleared = { title: 'Cot', quantity: 1, priceMinor: null, url: null, description: null };

  it.each(['priceMinor', 'url', 'description'] as const)('requires %s, with null to clear it, so a forgotten field is refused rather than wiped', (field) => {
    expect(editItemRequestSchema.safeParse(cleared).success).toBe(true);
    expect(editItemRequestSchema.safeParse({ ...cleared, [field]: undefined }).success).toBe(false);
  });
});
