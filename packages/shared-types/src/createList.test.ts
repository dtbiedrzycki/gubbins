import { describe, expect, it } from 'vitest';
import { createListRequestSchema, createListResponseSchema } from './createList.js';

describe('createListRequestSchema', () => {
  it('accepts a request with a list title and key', () => {
    const result = createListRequestSchema.safeParse({ listTitle: 'Baby Shower', key: 'abacus-abdomen-able' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty listTitle', () => {
    const result = createListRequestSchema.safeParse({ listTitle: '', key: 'abacus-abdomen-able' });
    expect(result.success).toBe(false);
  });

  it('passes the list description through', () => {
    const request = createListRequestSchema.parse({ listTitle: 'Baby Shower', listDescription: 'Due in May', key: 'abacus-abdomen-able' });
    expect(request.listDescription).toBe('Due in May');
  });
});

describe('createListResponseSchema', () => {
  it('accepts a response of slug, owner token and key', () => {
    const result = createListResponseSchema.safeParse({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key' });
    expect(result.success).toBe(true);
  });
});
