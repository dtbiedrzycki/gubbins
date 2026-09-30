import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { mock } from '../test/msw/mock';
import { api, ApiError } from './client';

describe('api.createList', () => {
  it('returns the response body on success', async () => {
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' }));

    const result = await api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    expect(result).toEqual({ slug: 'abc123', ownerToken: 'owner-tok', key: 'guest-key', itemId: 'item-1' });
  });

  it('throws ApiError carrying the status and the server message for a documented error', async () => {
    server.use(mock('post', '/api/lists', 400, { message: 'Invalid request' }));

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' }))
      .rejects.toMatchObject({ status: 400, message: 'Invalid request' });
  });

  // Deliberately outside the contract: raw MSW, because no route documents a 500.
  it('throws ApiError for an undocumented status', async () => {
    server.use(http.post('/api/lists', () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })));

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' })).rejects.toThrow(ApiError);
  });

  it('falls back to a generic message when the error body is not JSON (e.g. a proxy page)', async () => {
    server.use(http.post('/api/lists', () => new HttpResponse('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })));

    await expect(api.createList({ listTitle: 'Baby Shower', itemTitle: 'Stroller' }))
      .rejects.toMatchObject({ status: 502, message: 'Request failed' });
  });
});

describe('path parameters', () => {
  it('percent-encodes a slug so it stays a single path segment', async () => {
    let requested = '';
    server.use(http.get('/api/lists/:slug', ({ request }) => {
      requested = new URL(request.url).pathname;
      return HttpResponse.json({ title: 't', item: { id: 'i', title: 'x', status: 'available' } });
    }));

    await api.getListView('a b/c');

    expect(requested).toBe('/api/lists/a%20b%2Fc');
  });

  it('sends slug and itemId to the hold route', async () => {
    let requested = '';
    server.use(http.post('/api/lists/:slug/items/:itemId/hold', ({ request }) => {
      requested = new URL(request.url).pathname;
      return HttpResponse.json({ holdId: 'h', itemId: 'item-1', expiresAt: '2026-01-04T00:00:00.000Z' }, { status: 201 });
    }));

    await api.holdItem('abc123', 'item-1', { idempotencyKey: 'k' });

    expect(requested).toBe('/api/lists/abc123/items/item-1/hold');
  });
});
