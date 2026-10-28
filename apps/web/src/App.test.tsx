import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from './test/msw/server';
import { mock } from './test/msw/mock';

// A fresh module each time, so no page chunk is already loaded from an earlier test.
async function renderApp() {
  vi.resetModules();
  const { default: App } = await import('./App');
  server.use(mock('get', '/api/instance', 200, { sourceUrl: 'https://git.example.org/fork', privacyContact: null }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('renders the create-list page at the root path', async () => {
    await renderApp();

    expect(await screen.findByRole('heading', { name: 'Create a wishlist' })).toBeInTheDocument();
  });

  it('shows the footer while the page is still loading', async () => {
    await renderApp();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Create a wishlist' });
  });
});
