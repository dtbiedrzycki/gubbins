import { describe, expect, it } from 'vitest';
import { createListRequestSchema, createListResponseSchema } from './createList.js';

describe('createListRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty listTitle', () => {
    const result = createListRequestSchema.safeParse({ listTitle: '' });
    expect(result.success).toBe(false);
  });

  it('keeps the list description', () => {
    const request = createListRequestSchema.parse({ listTitle: 'Baby Shower', listDescription: 'Due in May' });
    expect(request.listDescription).toBe('Due in May');
  });
});

describe('createListResponseSchema', () => {
  it('accepts a valid response', () => {
    const result = createListResponseSchema.safeParse({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key' });
    expect(result.success).toBe(true);
  });
});
