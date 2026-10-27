import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { Footer, UPSTREAM_SOURCE_URL } from './Footer';

function renderFooter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Footer /></QueryClientProvider>);
  return client;
}

describe('Footer', () => {
  it('links the license and the source URL the server gives', async () => {
    server.use(mock('get', '/api/instance', 200, { sourceUrl: 'https://git.example.org/fork', privacyContact: null }));
    renderFooter();

    await waitFor(() => expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://git.example.org/fork'));
    expect(screen.getByRole('link', { name: 'AGPL-3.0' })).toHaveAttribute('href', 'https://www.gnu.org/licenses/agpl-3.0.html');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });

  it("falls back to the upstream repository when the server can't be reached", async () => {
    server.use(http.get('/api/instance', () => HttpResponse.json({ message: 'boom' }, { status: 500 })));
    const client = renderFooter();

    await waitFor(() => expect(client.getQueryState(['instance'])?.status).toBe('error'));
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', UPSTREAM_SOURCE_URL);
  });
});
