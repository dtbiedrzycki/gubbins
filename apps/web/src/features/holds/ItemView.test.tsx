import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { ItemView } from './ItemView';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('ItemView', () => {
  it('shows a Hold button for an available item, then confirms and holds it', async () => {
    server.use(
      http.post('/api/lists/abc123/items/item-1/hold', () =>
        HttpResponse.json({ holdId: 'hold-1', itemId: 'item-1', expiresAt: '2026-01-04T00:00:00.000Z' }, { status: 201 }),
      ),
    );
    const user = userEvent.setup();
    renderWithQueryClient(
      <ItemView slug="abc123" listTitle="Baby Shower" item={{ id: 'item-1', title: 'Stroller', status: 'available' }} />,
    );

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Stroller is held.');
  });

  it('renders an already-held item as held immediately, with no Hold button', () => {
    renderWithQueryClient(
      <ItemView slug="abc123" listTitle="Baby Shower" item={{ id: 'item-1', title: 'Stroller', status: 'held' }} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Stroller is held.');
    expect(screen.queryByRole('button', { name: 'Hold this item' })).not.toBeInTheDocument();
  });

  it('shows the server error message in the dialog when the hold request fails', async () => {
    server.use(http.post('/api/lists/abc123/items/item-1/hold', () => HttpResponse.json({ message: 'Item already held' }, { status: 409 })));
    const user = userEvent.setup();
    renderWithQueryClient(
      <ItemView slug="abc123" listTitle="Baby Shower" item={{ id: 'item-1', title: 'Stroller', status: 'available' }} />,
    );

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Item already held');
  });
});
