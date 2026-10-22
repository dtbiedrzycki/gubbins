import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { mock } from '../test/msw/mock';
import { api, ApiError } from './client';
import type { HoldView } from '@gubbins/shared-types';

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
      return HttpResponse.json({ title: 't', items: [], payment: { venmoHandle: null, zelleHandle: null }, myHolds: [], capabilities: { holdDurationDays: 3 } });
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

    await api.holdItem('abc123', 'item-1', { idempotencyKey: 'k', name: 'Ada' });

    expect(requested).toBe('/api/lists/abc123/items/item-1/hold');
  });
});

describe('hold actions', () => {
  const view: HoldView = {
    holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-07T00:00:00.000Z',
    extendedAt: '2026-01-02T00:00:00.000Z', actions: { extend: false, release: true, purchase: true },
  };

  it.each([
    ['extendHold', 'extend'],
    ['releaseHold', 'release'],
    ['markHoldPurchased', 'purchase'],
  ] as const)('%s posts to the %s route with no body and returns the hold view', async (method, action) => {
    let path = '';
    let body = 'unset';
    let contentType: string | null = 'unset';
    server.use(http.post(`/api/lists/:slug/holds/:holdId/${action}`, async ({ request }) => {
      path = new URL(request.url).pathname;
      body = await request.text();
      contentType = request.headers.get('content-type');
      return HttpResponse.json(view);
    }));

    await expect(api[method]('abc123', 'hold-1')).resolves.toEqual(view);

    expect(path).toBe(`/api/lists/abc123/holds/hold-1/${action}`);
    expect(body).toBe('');
    // A JSON content type on an empty body is a 400 from Fastify
    // (FST_ERR_CTP_EMPTY_JSON_BODY), so none may be sent.
    expect(contentType).toBeNull();
  });

  it('carries the 409 code on ApiError, beside the message', async () => {
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));

    await expect(api.extendHold('abc123', 'hold-1'))
      .rejects.toMatchObject({ status: 409, code: 'hold_not_active', message: 'This hold is no longer active.' });
  });
});

describe('network failures', () => {
  it('become an ApiError a guest can read, not the browser\'s fetch error', async () => {
    server.use(http.get('/api/lists/:slug', () => HttpResponse.error()));

    await expect(api.getListView('abc123'))
      .rejects.toMatchObject({ status: 0, message: "Couldn't reach the server. Check your connection and try again." });
  });
});
