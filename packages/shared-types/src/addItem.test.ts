import { describe, expect, it } from 'vitest';
import { addItemRequestSchema } from './addItem.js';

describe('addItemRequestSchema', () => {
  it.each([
    { type: 'single', title: 'Cot' },
    { type: 'group', title: 'Pram', priceMinor: 30000 },
  ])('keeps the description of a $type item', (item) => {
    const request = addItemRequestSchema.parse({ ...item, description: 'The grey one' });
    expect(request.description).toBe('The grey one');
  });
});
