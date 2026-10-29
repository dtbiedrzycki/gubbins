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

  it('accepts a request without an item', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty itemTitle', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower', itemTitle: '' });
    expect(result.success).toBe(false);
  });

  it('keeps the list description', () => {
    const request = createListRequestSchema.parse({ listTitle: 'Baby Shower', itemTitle: 'Stroller', listDescription: 'Due in May' });
    expect(request.listDescription).toBe('Due in May');
  });
});

describe('createListResponseSchema', () => {
  it('accepts a response without an itemId', () => {
    const result = createListResponseSchema.safeParse({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid response', () => {
    const result = createListResponseSchema.safeParse({
      slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1',
    });
    expect(result.success).toBe(true);
  });
});
