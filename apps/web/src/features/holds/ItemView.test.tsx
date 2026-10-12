import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { ItemView } from './ItemView';

const heldView: HoldView = {
  holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z',
  extendedAt: null, actions: { extend: true, release: true, purchase: true },
};

function renderItem(status: ListViewResponse['item']['status']): void {
  const ui: ReactElement = (
    <ItemView slug="abc123" listTitle="Baby Shower" holdDurationDays={3} item={{ id: 'item-1', title: 'Stroller', status }} />
  );
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
}

/** Records the idempotency key of every hold request; answers each with the next status given. */
function holdEndpoint(...statuses: number[]) {
  const keys: string[] = [];
  server.use(http.post('/api/lists/abc123/items/item-1/hold', async ({ request }) => {
    keys.push(((await request.json()) as { idempotencyKey: string }).idempotencyKey);
    const status = statuses[keys.length - 1] ?? 201;
    return status === 201 ? HttpResponse.json(heldView, { status }) : HttpResponse.json({ message: 'Request failed' }, { status });
  }));
  return keys;
}

describe('ItemView', () => {
  it('opens the hold dialog from an available item and closes it once the hold succeeds', async () => {
    holdEndpoint(201);
    const user = userEvent.setup();
    renderItem('available');

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    expect(screen.getByText('Held for you for 3 days.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
  });

  it('sends the key minted at opening on every retry — not a fresh one per tap (ADR-0048)', async () => {
    const keys = holdEndpoint(503, 201);
    const user = userEvent.setup();
    renderItem('available');

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('mints a new key for a new opening, and forgets the old error', async () => {
    const keys = holdEndpoint(503, 503);
    const user = userEvent.setup();
    renderItem('available');

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('returns focus to the Hold button when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderItem('available');

    await user.click(screen.getByRole('button', { name: 'Hold this item' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Hold this item' })).toHaveFocus();
  });

  it.each([
    ['held', 'Stroller is held.'],
    ['purchased', 'Stroller has been purchased.'],
  ] as const)('shows a %s item as such, with no Hold button', (status, message) => {
    renderItem(status);
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Hold this item' })).not.toBeInTheDocument();
  });
});
