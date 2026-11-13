import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { mock } from '../test/msw/mock';
import { server } from '../test/msw/server';
import ManagePage from './ManagePage';

const view = (titles: string[]): ManageViewResponse => ({
  title: 'Baby Shower', description: null, theme: 'storybook', key: 'maple-lantern-otter',
  items: titles.map((title, n) => ({
    id: `i${n}`, type: 'single', title, quantity: 1, priceMinor: 2400, url: null, description: null,
    deletable: true, committedUnits: 0, pledgedMinor: null,
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
