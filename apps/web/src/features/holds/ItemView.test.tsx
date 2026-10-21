import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { ItemView } from './ItemView';

const heldView: HoldView = {
  holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z',
  extendedAt: null, actions: { extend: true, release: true, purchase: true },
};

const payment: ListViewResponse['payment'] = { venmoHandle: 'my-venmo', zelleHandle: null };

type Item = NonNullable<ListViewResponse['items']>[number];
const single = (over: Partial<Item> = {}): Item => ({
  id: 'item-1', title: 'Stroller', type: 'single', status: 'available', availableUnits: 1, url: null, priceMinor: null, pledgedMinor: null, ...over,
});

function renderItem(over: Partial<Item> = {}): void {
  const ui = <ItemView slug="abc123" holdDurationDays={3} item={single(over)} payment={payment} />;
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
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    expect(screen.getByText('Held for you for 3 days.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
  });

  it('sends the key minted at opening on every retry — not a fresh one per tap (ADR-0048)', async () => {
    const keys = holdEndpoint(503, 201);
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('mints a new key for a new opening, and forgets the old error', async () => {
    const keys = holdEndpoint(503, 503);
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('returns focus to the Hold button when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: /^Hold this item/ })).toHaveFocus();
  });

  it.each([
    ['held', 'Stroller is held.'],
    ['purchased', 'Stroller has been purchased.'],
  ] as const)('shows a %s item as such, with no Hold button', (status, message) => {
    renderItem({ status });
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: /^Hold this item/ })).not.toBeInTheDocument();
  });

  it('keeps the Hold button last in its stack, so space-y adds no margin below it', () => {
    renderItem();
    const button = screen.getByRole('button', { name: /^Hold this item/ });
    expect(button.parentElement?.lastElementChild).toBe(button);
  });

  it('announces the item held through the status region already on the page', () => {
    const client = new QueryClient();
    const view = (status: Item['status']) => (
      <QueryClientProvider client={client}>
        <ItemView slug="abc123" holdDurationDays={3} item={single({ status })} payment={payment} />
      </QueryClientProvider>
    );
    const { rerender } = render(view('available'));
    // Screen readers miss a live region that arrives already holding its text.
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    rerender(view('held'));

    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Stroller is held.');
  });

  it('shows the title as a heading and the price formatted', () => {
    renderItem({ priceMinor: 45000 });
    expect(screen.getByRole('heading', { level: 2, name: 'Stroller' })).toBeInTheDocument();
    expect(screen.getByText('$450.00')).toBeInTheDocument();
  });

  it('links to the store in a new tab, naming the item', () => {
    renderItem({ url: 'https://shop.example/stroller' });
    const link = screen.getByRole('link', { name: 'View in store for Stroller (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://shop.example/stroller');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('has no store link without a url', () => {
    renderItem();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('names the item in the Hold button', () => {
    renderItem();
    expect(screen.getByRole('button', { name: 'Hold this item: Stroller' })).toBeInTheDocument();
  });

  it('shows the units left only when more than one is available', () => {
    renderItem({ availableUnits: 2 });
    expect(screen.getByText('2 left')).toBeInTheDocument();
  });

  it.each([
    ['one unit is left', { availableUnits: 1 }],
    ['held', { status: 'held', availableUnits: 0 }],
    ['purchased', { status: 'purchased', availableUnits: 0 }],
  ] as const)('hides the units left when %s', (_, over) => {
    renderItem(over);
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
  });

  it('gives a group gift its price and no Hold button or units', () => {
    renderItem({ type: 'group', priceMinor: 20000, availableUnits: 0 });
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Hold this item/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
  });

  it.each([
    [16250, 16250, '$162.50 of $450.00 pledged · 36%'],
    [52000, 45000, '$520.00 of $450.00 pledged · 116%'],
  ])('shows a group gift pledged %i toward its price as progress', (pledgedMinor, value, label) => {
    renderItem({ type: 'group', priceMinor: 45000, pledgedMinor, availableUnits: 0 });
    const progress = screen.getByRole('progressbar', { name: label });
    expect(progress).toHaveAttribute('max', '45000');
    expect(progress).toHaveAttribute('value', String(value));
  });

  it('lets a guest chip in toward a group gift, thanks them, and hands focus back', async () => {
    server.use(mock('post', '/api/lists/{slug}/items/{itemId}/contributions', 201, { contributionId: 'c-1', itemId: 'item-1', amountMinor: 28750 }));
    const user = userEvent.setup();
    renderItem({ type: 'group', priceMinor: 45000, pledgedMinor: 16250, availableUnits: 0 });
    const status = screen.getByRole('status');

    await user.click(screen.getByRole('button', { name: 'Chip in' }));
    await user.click(screen.getByLabelText('Cover the rest ($287.50)'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: "I've sent it" }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
    expect(status).toHaveTextContent('Thank you! Your pledge of $287.50 is recorded.');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Chip in' })).toHaveFocus());
  });
});
