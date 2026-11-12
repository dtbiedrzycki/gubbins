import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from './test/msw/server';
import { mock } from './test/msw/mock';

// A fresh module each time, so no page chunk is already loaded from an earlier test.
async function renderApp(path = '/wishlists/new') {
  window.history.pushState({}, '', path);
  vi.resetModules();
  const { default: App } = await import('./App');
  server.use(mock('get', '/api/instance', 200, { sourceUrl: 'https://git.example.org/fork', privacyContact: null, version: '0.1.0' }));
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

  it('shows the footer while the page is still loading', async () => {
    await renderApp();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Create a wishlist' });
  });
});

describe('App crashes', () => {
  const reload = vi.fn();
  afterEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    vi.restoreAllMocks();
    vi.doUnmock('./pages/HomePage');
    vi.doUnmock('./pages/reloadPage');
  });

  async function renderCrashingHome(error: Error) {
    vi.doMock('./pages/reloadPage', () => ({ reloadPage: reload }));
    vi.doMock('./pages/HomePage', () => ({
      default: () => {
        throw error;
      },
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderApp('/');
  }

  it('shows a reload page when a page fails to render', async () => {
    await renderCrashingHome(new Error('boom'));

    expect(await screen.findByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows a not-found page for an unknown address', async () => {
    await renderApp('/nope');

    expect(await screen.findByRole('heading', { name: 'There’s nothing at this address.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });

  it.each([
    ['Chrome', 'Failed to fetch dynamically imported module: https://x.example/assets/HomePage-x.js'],
    ['Safari', 'Importing a module script failed.'],
    ['Firefox', 'error loading dynamically imported module: https://x.example/assets/HomePage-x.js'],
  ])('reloads once when %s cannot load a page’s code', async (_browser, message) => {
    await renderCrashingHome(new TypeError(message));

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem('gubbins:chunk-reload')).not.toBeNull();
  });

  it('shows the reload page instead of reloading a second time in the same tab', async () => {
    sessionStorage.setItem('gubbins:chunk-reload', '1');
    await renderCrashingHome(new TypeError('Importing a module script failed.'));

    expect(await screen.findByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again for a later deploy once a page has rendered since the last reload', async () => {
    sessionStorage.setItem('gubbins:chunk-reload', '1');
    await renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Gubbins' });
    cleanup();

    await renderCrashingHome(new TypeError('Importing a module script failed.'));

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('does not reload when session storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await renderCrashingHome(new TypeError('Importing a module script failed.'));

    expect(await screen.findByRole('heading', { name: 'Something went wrong.' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
