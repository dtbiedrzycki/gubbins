import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../test/msw/server';
import ListPage from './ListPage';

const hold: HoldView = {
  holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z',
  extendedAt: null, actions: { extend: true, release: true, purchase: true },
};
const view = (held: boolean): ListViewResponse => ({
  title: 'Baby Shower',
  item: { id: 'item-1', title: 'Stroller', status: held ? 'held' : 'available' },
  myHolds: held ? [hold] : [],
  capabilities: { holdDurationDays: 3 },
});

function renderListPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/abc123']}>
        <Routes><Route path="/:slug" element={<ListPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ListPage', () => {
  it('holds the item, then shows it held and under "Your holds" with its actions', async () => {
    let held = false;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/items/item-1/hold', () => { held = true; return HttpResponse.json(hold, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: 'Hold this item' }));
    expect(screen.getByText('Held for you for 3 days.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    const yourHolds = screen.getByRole('region', { name: 'Your holds' });
    expect(await within(yourHolds).findByRole('button', { name: 'Extend hold' })).toBeInTheDocument();
    expect(screen.getByText('Stroller is held.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });
});
