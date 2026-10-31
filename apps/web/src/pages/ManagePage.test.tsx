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
  title: 'Baby Shower', description: null, key: 'maple-lantern-otter',
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

describe('ManagePage', () => {
  it('after the token, shows the list above the add form, and shows an added item without a reload', async () => {
    let titles = ['Rings'];
    server.use(
      mock('post', '/api/lists/{slug}/owner-session', 200, { ok: true }),
      http.get('/api/lists/:slug/manage', () => HttpResponse.json(view(titles))),
      http.post('/api/lists/:slug/items', () => { titles = ['Rings', 'Cot']; return HttpResponse.json({ id: 'i1' }, { status: 201 }); }),
    );
    const user = await enterToken();

    const details = await screen.findByRole('heading', { name: 'List details' });
    expect(await screen.findByText('Rings')).toBeInTheDocument();
    const title = screen.getByLabelText('Title');
    expect(details.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(title, 'Cot');
    await user.type(screen.getByLabelText('Price (USD)'), '100');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('Cot')).toBeInTheDocument();
  });

  it('returns to the token gate when the view answers 404', async () => {
    server.use(
      mock('post', '/api/lists/{slug}/owner-session', 200, { ok: true }),
      mock('get', '/api/lists/{slug}/manage', 404, { message: 'Not found' }),
    );
    await enterToken();

    expect(await screen.findByText('Enter your owner token again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner token')).toBeInTheDocument();
  });
});
