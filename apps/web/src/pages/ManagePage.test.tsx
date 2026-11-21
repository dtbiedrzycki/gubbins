import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { mock } from '../test/msw/mock';
import { server } from '../test/msw/server';
import ManagePage from './ManagePage';

const view = (titles: string[], theme: ManageViewResponse['theme'] = 'storybook'): ManageViewResponse => ({
  title: 'Baby Shower', description: null, theme, key: 'maple-lantern-otter',
  items: titles.map((title, n) => ({
    id: `i${n}`, type: 'single', title, quantity: 1, priceMinor: 2400, url: null, description: null,
    deletable: true, committedUnits: 0, purchasedUnits: 0, pledgedMinor: null,
  })),
});

async function enterToken() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={['/abc123/manage']}>
        <Routes><Route path="/:slug/manage" element={<ManagePage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await user.type(screen.getByLabelText('Owner token'), 'the-token');
  await user.click(screen.getByRole('button', { name: 'Manage list' }));
  return user;
}

function serveView(getTitles: () => string[]) {
  server.use(
    mock('post', '/api/lists/{slug}/owner-session', 200, { ok: true }),
    http.get('/api/lists/:slug/manage', () => HttpResponse.json(view(getTitles()))),
  );
}

describe('ManagePage', () => {
  it('shows the list and its items after the owner token is entered', async () => {
    serveView(() => ['Rings']);
    await enterToken();

    expect(await screen.findByRole('heading', { name: 'Baby Shower' })).toBeInTheDocument();
    expect(await screen.findByText('Rings')).toBeInTheDocument();
  });

  it('shows an added item without a reload', async () => {
    let titles = ['Rings'];
    serveView(() => titles);
    server.use(
      http.post('/api/lists/:slug/items', () => { titles = ['Rings', 'Cot']; return HttpResponse.json({ id: 'i1' }, { status: 201 }); }),
    );
    const user = await enterToken();
    await screen.findByText('Rings');

    await user.type(screen.getByLabelText('Title'), 'Cot');
    await user.type(screen.getByLabelText('Price (USD)'), '100');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('Cot')).toBeInTheDocument();
  });

  it('says the owner session has ended when the view answers 404', async () => {
    server.use(
      mock('post', '/api/lists/{slug}/owner-session', 200, { ok: true }),
      mock('get', '/api/lists/{slug}/manage', 404, { message: 'Not found' }),
    );
    await enterToken();

    expect(await screen.findByText('Your owner session has ended. Enter your owner token to keep managing your list.')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner token')).toBeInTheDocument();
  });

  it('says the owner session has ended when adding a gift answers 404', async () => {
    serveView(() => ['Rings']);
    server.use(http.post('/api/lists/:slug/items', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));
    const user = await enterToken();
    await screen.findByText('Rings');

    await user.type(screen.getByLabelText('Title'), 'Cot');
    await user.type(screen.getByLabelText('Price (USD)'), '100');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('Your owner session has ended. Enter your owner token to keep managing your list.')).toBeInTheDocument();
  });

  it('shows the token screen in the default style once the owner session has ended', async () => {
    server.use(
      mock('post', '/api/lists/{slug}/owner-session', 200, { ok: true }),
      http.get('/api/lists/:slug/manage', () => HttpResponse.json(view(['Rings'], 'groovy'))),
    );
    server.use(http.post('/api/lists/:slug/items', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));
    const user = await enterToken();
    await screen.findByText('Rings');
    expect(document.documentElement.dataset.listTheme).toBe('groovy');

    await user.type(screen.getByLabelText('Title'), 'Cot');
    await user.type(screen.getByLabelText('Price (USD)'), '100');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('Your owner session has ended. Enter your owner token to keep managing your list.')).toBeInTheDocument();
    expect(document.documentElement.dataset.listTheme).toBeUndefined();
  });

  /** Serves who gave what for the first gift, and counts the requests for it. */
  function serveDetails(status = 200, ...later: number[]) {
    let requests = 0;
    server.use(http.get('/api/lists/:slug/gift-details', () => {
      requests += 1;
      const answer = requests === 1 ? status : later[requests - 2] ?? later.at(-1) ?? status;
      return answer === 200
        ? HttpResponse.json({ items: [{ itemId: 'i0', purchases: [{ name: 'Maya', units: 1, message: null, purchasedAt: '2026-11-12T12:00:00.000Z' }], holds: [], pledges: [] }] })
        : HttpResponse.json({ message: answer === 404 ? 'Not found' : 'Internal server error' }, { status: answer });
    }));
    return () => requests;
  }

  it('makes no gift-details request until the owner presses Show who gave what', async () => {
    serveView(() => ['Rings']);
    const requests = serveDetails();
    const user = await enterToken();
    await screen.findByText('Rings');
    expect(requests()).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Show who gave what' }));
    await screen.findByText('Maya');
    expect(requests()).toBe(1);
  });

  it("shows each gift's card once the owner presses Show who gave what", async () => {
    serveView(() => ['Rings']);
    serveDetails();
    const user = await enterToken();

    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));

    expect(await screen.findByRole('region', { name: 'Who gave what for Rings' })).toHaveTextContent('Maya');
  });

  it('removes the details when the owner presses Hide', async () => {
    serveView(() => ['Rings']);
    serveDetails();
    const user = await enterToken();
    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));
    await screen.findByText('Maya');

    await user.click(screen.getByRole('button', { name: 'Hide' }));

    expect(screen.queryByText('Maya')).not.toBeInTheDocument();
  });

  it('fetches afresh when the owner shows the details again after hiding them', async () => {
    serveView(() => ['Rings']);
    const requests = serveDetails();
    const user = await enterToken();
    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));
    await screen.findByText('Maya');
    await user.click(screen.getByRole('button', { name: 'Hide' }));

    await user.click(screen.getByRole('button', { name: 'Show who gave what' }));

    await screen.findByText('Maya');
    expect(requests()).toBe(2);
  });

  it('refetches the shown details after the owner moves a gift', async () => {
    serveView(() => ['Rings', 'Cot']);
    const requests = serveDetails();
    server.use(http.post('/api/lists/:slug/items/:itemId/move', () => HttpResponse.json({ ok: true })));
    const user = await enterToken();
    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));
    await screen.findByText('Maya');

    await user.click(screen.getByRole('button', { name: 'Move Rings down' }));

    await waitFor(() => expect(requests()).toBe(2));
  });

  it('shows the details when the owner tries again after a failed load', async () => {
    serveView(() => ['Rings']);
    const requests = serveDetails(500, 200);
    const user = await enterToken();
    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));
    await screen.findByText(/^Couldn’t show who gave what./);

    await user.click(screen.getByRole('button', { name: 'Show who gave what' }));

    expect(await screen.findByText('Maya')).toBeInTheDocument();
    expect(requests()).toBe(2);
  });

  it('makes no further request after a failed load until the owner tries again', async () => {
    serveView(() => ['Rings', 'Cot']);
    const requests = serveDetails(500, 200);
    server.use(http.post('/api/lists/:slug/items/:itemId/move', () => HttpResponse.json({ ok: true })));
    const user = await enterToken();
    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));
    await screen.findByText(/^Couldn’t show who gave what./);

    await user.click(screen.getByRole('button', { name: 'Move Rings down' }));

    expect(await screen.findByRole('button', { name: 'Move Rings up' })).toBeInTheDocument();
    expect(screen.queryByText('Maya')).not.toBeInTheDocument();
    expect(requests()).toBe(1);
  });

  it('keeps offering Hide while shown details fail to refresh', async () => {
    serveView(() => ['Rings', 'Cot']);
    const requests = serveDetails(200, 500);
    server.use(http.post('/api/lists/:slug/items/:itemId/move', () => HttpResponse.json({ ok: true })));
    const user = await enterToken();
    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));
    await screen.findByText('Maya');

    await user.click(screen.getByRole('button', { name: 'Move Rings down' }));
    await screen.findByText(/^Couldn’t show who gave what\./);

    expect(requests()).toBe(2);
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
  });

  it('sends the owner back to the token gate, hidden again, when the details answer 404', async () => {
    serveView(() => ['Rings']);
    const requests = serveDetails(404);
    const user = await enterToken();
    await user.click(await screen.findByRole('button', { name: 'Show who gave what' }));

    expect(await screen.findByText('Your owner session has ended. Enter your owner token to keep managing your list.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Owner token'), 'the-token');
    await user.click(screen.getByRole('button', { name: 'Manage list' }));
    await screen.findByText('Rings');
    expect(screen.getByRole('button', { name: 'Show who gave what' })).toBeInTheDocument();
    expect(requests()).toBe(1);
  });

  it("says the gift may be gone when a gift's own action answers 404", async () => {
    serveView(() => ['Rings']);
    server.use(http.delete('/api/lists/:slug/items/:itemId', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));
    const user = await enterToken();

    await user.click(await screen.findByRole('button', { name: 'Delete Rings' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('That gift may have been deleted on another device, or your owner session has ended. Enter your owner token to keep managing your list.')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner token')).toBeInTheDocument();
  });
});
