import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw/server';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { ManageItems } from './ManageItems';

const item = (over: Partial<ManageViewResponse['items'][number]>): ManageViewResponse['items'][number] => ({
  id: 'i1', type: 'single', title: 'Rings', quantity: 1, priceMinor: 2400, url: null, description: null,
  deletable: true, committedUnits: 0, pledgedMinor: null, ...over,
});

function renderItems(items: ManageViewResponse['items']) {
  const client = new QueryClient();
  const view = (shown: ManageViewResponse['items']) => (
    <QueryClientProvider client={client}>
      <ManageItems slug="abc123" onUnauthorized={() => {}} items={shown} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(items));
  return { rerender: (shown: ManageViewResponse['items']) => rerender(view(shown)) };
}

describe('ManageItems', () => {
  it("shows each item's price and quantity, and a group gift's target", () => {
    renderItems([
      item({}),
      item({ id: 'i2', title: 'Swaddles', quantity: 2, priceMinor: 3200 }),
      item({ id: 'i3', type: 'group', title: 'Stroller fund', priceMinor: 40000, pledgedMinor: 0 }),
    ]);

    expect(screen.getByText('$24.00 · quantity 1')).toBeInTheDocument();
    expect(screen.getByText('$32.00 · quantity 2')).toBeInTheDocument();
    expect(screen.getByText('$400.00 target')).toBeInTheDocument();
  });

  it('leaves the price out for a single item without one', () => {
    renderItems([item({ quantity: 3, priceMinor: null })]);

    expect(screen.getByText('quantity 3')).toBeInTheDocument();
  });

  it('Edit opens the form for that item', async () => {
    const user = userEvent.setup();
    renderItems([item({}), item({ id: 'i2', title: 'Swaddles' })]);

    await user.click(screen.getByRole('button', { name: 'Edit Swaddles' }));

    expect(screen.getByLabelText('Title')).toHaveValue('Swaddles');
    expect(screen.getByRole('button', { name: 'Edit Rings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('deletes an untouched item after confirming, and Keep it backs out', async () => {
    const deleted: string[] = [];
    server.use(http.delete('/api/lists/:slug/items/:itemId', ({ params }) => {
      deleted.push(params.itemId as string);
      return HttpResponse.json({ ok: true });
    }));
    const user = userEvent.setup();
    renderItems([item({})]);

    await user.click(screen.getByRole('button', { name: 'Delete Rings' }));
    expect(screen.getByRole('group', { name: 'Delete \u201cRings\u201d? This can\u2019t be undone.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('button', { name: 'Keep it' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Rings' })).toHaveFocus();
    expect(deleted).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Delete Rings' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toEqual(['i1']));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Items' })).toHaveFocus());
  });

  it('disables Delete with the reason once a guest has acted on the item', () => {
    renderItems([item({ deletable: false })]);

    const button = screen.getByRole('button', { name: 'Delete Rings' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Guests have already picked this one, so it can\u2019t be deleted.');
  });

  it("shows the server's reason once, with focus on it, when a guest got there first", async () => {
    const reason = "Guests have already picked this one, so it can't be deleted.";
    server.use(http.delete('/api/lists/:slug/items/:itemId', () => HttpResponse.json({ message: reason, code: 'item_has_guest_history' }, { status: 409 })));
    const user = userEvent.setup();
    const { rerender } = renderItems([item({})]);

    await user.click(screen.getByRole('button', { name: 'Delete Rings' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(reason));
    expect(screen.getByRole('alert')).toHaveFocus();
    // The refreshed list now marks the item undeletable; the reason still shows only once.
    rerender([item({ deletable: false })]);
    expect(screen.getAllByText(/can.t be deleted/)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete Rings' })).toHaveAccessibleDescription(reason);
  });
});
