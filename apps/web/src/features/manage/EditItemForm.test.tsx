import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { EditItemForm } from './EditItemForm';

type Item = ManageViewResponse['items'][number];
const single: Item = {
  id: 'i1', type: 'single', title: 'Muslin swaddles', quantity: 3, priceMinor: 3200, url: 'https://example.com/s',
  description: 'Any neutral colour.', deletable: false, committedUnits: 2, pledgedMinor: null,
};
const group: Item = { ...single, id: 'g1', type: 'group', title: 'Stroller fund', quantity: 1, priceMinor: 40000, url: null, description: null, committedUnits: 0, pledgedMinor: 20000 };

function renderForm(item: Item, props: Partial<Parameters<typeof EditItemForm>[0]> = {}) {
  const bodies: unknown[] = [];
  server.use(http.put('/api/lists/:slug/items/:itemId', async ({ request }) => {
    bodies.push(await request.json());
    return HttpResponse.json({ ok: true });
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditItemForm slug="abc123" item={item} onDone={() => {}} onUnauthorized={() => {}} {...props} />
    </QueryClientProvider>,
  );
  return bodies;
}

describe('EditItemForm', () => {
  it("starts with the item's values and sends every field, leaving out cleared ones", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    const bodies = renderForm(single, { onDone });

    expect(screen.getByText('Single item')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Muslin swaddles');
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('Quantity')).toHaveValue(3);
    expect(screen.getByLabelText('Price (USD)')).toHaveValue('32.00');
    expect(screen.getByLabelText('Store link')).toHaveValue('https://example.com/s');
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('Any neutral colour.');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodies).toEqual([{ title: 'Muslin swaddles', quantity: 3, priceMinor: 3200, url: 'https://example.com/s', description: 'Any neutral colour.' }]);

    bodies.length = 0;
    await user.clear(screen.getByLabelText('Price (USD)'));
    await user.clear(screen.getByLabelText('Store link'));
    await user.clear(screen.getByLabelText('Description (optional)'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toEqual([{ title: 'Muslin swaddles', quantity: 3 }]));
  });

  it('warns when the quantity drops below what guests hold or bought, and saves anyway', async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    const bodies = renderForm(single, { onDone });
    expect(screen.queryByText(/More may already be held/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '1');

    expect(screen.getByText('More may already be held or bought than this new quantity. Those stay as they are; guests can’t pick this item again until the count drops below 1.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodies).toEqual([expect.objectContaining({ quantity: 1 })]);
  });

  it("asks before lowering a group gift's target to what is already pledged", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    const bodies = renderForm(group, { onDone });

    expect(screen.getByText('Group gift · price is required')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Target (USD)'));
    await user.type(screen.getByLabelText('Target (USD)'), '150');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('This target is already met')).toBeInTheDocument();
    expect(screen.getByText('Guests have chipped in more than $150.00. Saving marks the gift as fully funded.')).toBeInTheDocument();
    expect(bodies).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.queryByText('This target is already met')).not.toBeInTheDocument();
    expect(bodies).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Save new target' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodies).toEqual([{ title: 'Stroller fund', quantity: 1, priceMinor: 15000 }]);
  });
});
