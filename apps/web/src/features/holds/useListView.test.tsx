import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw/server';
import { useListView } from './useListView';

// TanStack's default retry count stays in force; only the backoff is dropped,
// so every retry the hook allows has happened once the query reports its error.
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function requestsUntilError(respond: () => Response): Promise<number> {
  let gets = 0;
  server.use(http.get('/api/lists/abc123', () => { gets++; return respond(); }));
  const { result } = renderHook(() => useListView('abc123'), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  return gets;
}

describe('useListView', () => {
  it('does not retry a 401, so a new guest reaches the key prompt at once', async () => {
    expect(await requestsUntilError(() => HttpResponse.json({ message: 'Not found' }, { status: 401 }))).toBe(1);
  });

  it('retries a 503 once', async () => {
    expect(await requestsUntilError(() => HttpResponse.json({ message: 'Unavailable' }, { status: 503 }))).toBe(2);
  });

  it('retries a network failure once', async () => {
    expect(await requestsUntilError(() => HttpResponse.error())).toBe(2);
  });
});
