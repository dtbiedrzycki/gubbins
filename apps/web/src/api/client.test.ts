import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { api, ApiError } from './client';

describe('api.createList', () => {
  it('parses a successful response against the shared schema', async () => {
    server.use(
      http.post('/api/lists', () =>
        HttpResponse.json({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' }, { status: 201 }),
      ),
    );

    const result = await api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    expect(result).toEqual({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' });
  });

  it('throws ApiError carrying the status and server message on a non-ok response', async () => {
    server.use(
      http.post('/api/lists', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })),
    );

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' })).rejects.toThrow(ApiError);
  });
});
