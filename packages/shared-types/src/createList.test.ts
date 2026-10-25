import { describe, expect, it } from 'vitest';
import { createListRequestSchema, createListResponseSchema } from './createList.js';

describe('createListRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty listTitle', () => {
    const result = createListRequestSchema.safeParse({ listTitle: '', itemTitle: 'Stroller' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty itemTitle', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower', itemTitle: '' });
    expect(result.success).toBe(false);
  });
});

describe('createListResponseSchema', () => {
  it('accepts a valid response', () => {
    const result = createListResponseSchema.safeParse({
      slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1',
    });
    expect(result.success).toBe(true);
  });
});
