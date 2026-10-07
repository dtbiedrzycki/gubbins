import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { useHoldItem } from './useHoldItem';
import { useListView } from './useListView';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const listView = (status: ListViewResponse['item']['status']): ListViewResponse => ({
  title: 'Baby Shower',
  item: { id: 'item-1', title: 'Stroller', status },
  myHolds: [],
  capabilities: { holdDurationDays: 3 },
});

/** Mounts the list view query alongside the hold mutation, as the page does. */
function renderListAndHold() {
  return renderHook(() => ({ view: useListView('abc123'), hold: useHoldItem('abc123', 'item-1') }), { wrapper });
}

describe('useHoldItem', () => {
  it('refetches the list view when the hold fails, so the page shows who won', async () => {
    let listViewRequests = 0;
    server.use(
      // Stateful handlers (they count or delay requests), so raw MSW rather
      // than the fixed-response mock() helper.
      http.get('/api/lists/abc123', () => {
        listViewRequests += 1;
        return HttpResponse.json(listView(listViewRequests === 1 ? 'available' : 'held'));
      }),
      mock('post', '/api/lists/{slug}/items/{itemId}/hold', 409, { message: 'Item already held' }),
    );
    const { result } = renderListAndHold();
    await waitFor(() => expect(result.current.view.data?.item.status).toBe('available'));

    result.current.hold.mutate({ idempotencyKey: 'key-1' });

    await waitFor(() => expect(result.current.hold.isError).toBe(true));
    expect(result.current.view.data?.item.status).toBe('held');
  });

  it('stays pending until the refetched list view has landed', async () => {
    let listViewRequests = 0;
    let releaseRefetch!: () => void;
    const refetchReleased = new Promise<void>((resolve) => { releaseRefetch = resolve; });
    let holdRequested = false;
    server.use(
      http.get('/api/lists/abc123', async () => {
        listViewRequests += 1;
        if (listViewRequests === 1) return HttpResponse.json(listView('available'));
        await refetchReleased;
        return HttpResponse.json(listView('held'));
      }),
      http.post('/api/lists/abc123/items/item-1/hold', () => {
        holdRequested = true;
        return HttpResponse.json({ holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z', extendedAt: null, actions: { extend: true, release: true, purchase: true } }, { status: 201 });
      }),
    );
    const { result } = renderListAndHold();
    await waitFor(() => expect(result.current.view.data?.item.status).toBe('available'));

    result.current.hold.mutate({ idempotencyKey: 'key-1' });

    await waitFor(() => expect(listViewRequests).toBe(2));
    expect(holdRequested).toBe(true);
    expect(result.current.hold.isPending).toBe(true);

    releaseRefetch();

    await waitFor(() => expect(result.current.hold.isSuccess).toBe(true));
    expect(result.current.view.data?.item.status).toBe('held');
  });
});
