import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from './test/msw/server';
import { mock } from './test/msw/mock';

// A fresh module each time, so no page chunk is already loaded from an earlier test.
async function renderApp(path = '/wishlists/new') {
  window.history.pushState({}, '', path);
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
  it('serves the home page at /', async () => {
    await renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Gubbins' })).toBeInTheDocument();
  });

  it('serves the create form at /wishlists/new', async () => {
    await renderApp('/wishlists/new');

    expect(await screen.findByRole('heading', { name: 'Create a wishlist' })).toBeInTheDocument();
  });

  it('sends /wishlists to the create form', async () => {
    await renderApp('/wishlists');

    expect(await screen.findByRole('heading', { name: 'Create a wishlist' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/wishlists/new');
  });

  it('redirects an old list link to /wishlists/:slug, keeping the #fragment', async () => {
    server.use(mock('get', '/api/lists/{slug}', 404, { message: 'Not found' }));
    await renderApp('/abc123#maple-lantern-otter');

    await screen.findByRole('heading', { name: 'Knock, knock.' });
    expect(window.location.pathname).toBe('/wishlists/abc123');
    expect(window.location.hash).toBe('#maple-lantern-otter');
  });

  it('redirects an old manage link to /wishlists/:slug/manage', async () => {
    await renderApp('/abc123/manage');

    await screen.findByRole('heading', { name: 'Manage your list' });
    expect(window.location.pathname).toBe('/wishlists/abc123/manage');
  });

  it('shows the footer while the page is still loading', async () => {
    await renderApp();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Create a wishlist' });
  });
});
