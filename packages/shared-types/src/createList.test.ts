import { describe, expect, it } from 'vitest';
import { createListRequestSchema, createListResponseSchema } from './createList.js';

describe('createListRequestSchema', () => {
  it('accepts a request with only a list title', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty listTitle', () => {
    const result = createListRequestSchema.safeParse({ listTitle: '' });
    expect(result.success).toBe(false);
  });

  it('passes the list description through', () => {
    const request = createListRequestSchema.parse({ listTitle: 'Baby Shower', listDescription: 'Due in May' });
    expect(request.listDescription).toBe('Due in May');
  });
});

describe('createListResponseSchema', () => {
  it('accepts a response of slug, owner token and key', () => {
    const result = createListResponseSchema.safeParse({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key' });
    expect(result.success).toBe(true);
  });
});
