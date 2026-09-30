import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mock } from '../../test/msw/mock';
import { server } from '../../test/msw/server';
import { useCreateList } from './useCreateList';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCreateList', () => {
  it('resolves with the created list on success', async () => {
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'tok', key: 'key', itemId: 'item-1' }));
    const { result } = renderHook(() => useCreateList(), { wrapper });

    result.current.mutate({ listTitle: 'Baby Shower', itemTitle: 'Stroller' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ slug: 'abc123', ownerToken: 'tok', key: 'key', itemId: 'item-1' });
  });
});
