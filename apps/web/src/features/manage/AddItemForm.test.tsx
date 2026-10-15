import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mock } from '../../test/msw/mock';
import { server } from '../../test/msw/server';
import { AddItemForm } from './AddItemForm';

function renderForm(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('AddItemForm', () => {
  it('defaults to a single item and hides Quantity for a group gift, which needs a price', async () => {
    const user = userEvent.setup();
    renderForm(<AddItemForm slug="abc123" onUnauthorized={() => {}} />);

    expect(screen.getByLabelText('Single item')).toBeChecked();
    for (const label of ['Title', 'Quantity', 'Price (USD)', 'Store link']) expect(screen.getByLabelText(label)).toBeVisible();
    expect(screen.getByLabelText('Price (USD)')).not.toBeRequired();

    await user.click(screen.getByLabelText('Group gift'));
    expect(screen.queryByLabelText('Quantity')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Price (USD)')).toBeRequired();
  });

  it('posts the item with its price in cents, then clears the form and announces it', async () => {
    let body: unknown;
    server.use(http.post('/api/lists/:slug/items', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ itemId: 'i1' }, { status: 201 });
    }));
    const user = userEvent.setup();
    renderForm(<AddItemForm slug="abc123" onUnauthorized={() => {}} />);

    await user.type(screen.getByLabelText('Title'), 'Crib');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.type(screen.getByLabelText('Price (USD)'), '$199.99');
    await user.type(screen.getByLabelText('Store link'), 'https://shop.example/crib');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added "Crib".'));
    expect(body).toEqual({ type: 'single', title: 'Crib', quantity: 2, priceMinor: 19999, url: 'https://shop.example/crib' });
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('posts a group gift without a quantity', async () => {
    let body: unknown;
    server.use(http.post('/api/lists/:slug/items', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ itemId: 'i2' }, { status: 201 });
    }));
    const user = userEvent.setup();
    renderForm(<AddItemForm slug="abc123" onUnauthorized={() => {}} />);

    await user.click(screen.getByLabelText('Group gift'));
    await user.type(screen.getByLabelText('Title'), 'Stand mixer');
    await user.type(screen.getByLabelText('Price (USD)'), '450');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added "Stand mixer".'));
    expect(body).toEqual({ type: 'group', title: 'Stand mixer', priceMinor: 45000 });
  });

  it('rejects an unreadable price without calling the server', async () => {
    let called = false;
    server.use(http.post('/api/lists/:slug/items', () => { called = true; return HttpResponse.json({ itemId: 'i1' }, { status: 201 }); }));
    const user = userEvent.setup();
    renderForm(<AddItemForm slug="abc123" onUnauthorized={() => {}} />);

    await user.type(screen.getByLabelText('Title'), 'Crib');
    await user.type(screen.getByLabelText('Price (USD)'), 'lots');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a price like 25 or 25.50.');
    expect(screen.getByLabelText('Price (USD)')).toBeInvalid();
    expect(screen.getByLabelText('Price (USD)')).toHaveFocus();
    expect(screen.getByLabelText('Price (USD)')).toHaveAccessibleDescription('Enter a price like 25 or 25.50.');
    expect(called).toBe(false);
  });

  it("shows the server's message when a group gift has no payment method", async () => {
    const message = 'Add a Venmo or Zelle handle to this list before adding a group gift.';
    server.use(mock('post', '/api/lists/{slug}/items', 409, { code: 'no_payment_method', message }));
    const user = userEvent.setup();
    renderForm(<AddItemForm slug="abc123" onUnauthorized={() => {}} />);

    await user.click(screen.getByLabelText('Group gift'));
    await user.type(screen.getByLabelText('Title'), 'Stand mixer');
    await user.type(screen.getByLabelText('Price (USD)'), '450');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(screen.getByLabelText('Title')).toHaveValue('Stand mixer');
  });

  it('calls onUnauthorized when the owner cookie is not accepted', async () => {
    server.use(mock('post', '/api/lists/{slug}/items', 404, { message: 'Not found' }));
    const onUnauthorized = vi.fn();
    const user = userEvent.setup();
    renderForm(<AddItemForm slug="abc123" onUnauthorized={onUnauthorized} />);

    await user.type(screen.getByLabelText('Title'), 'Crib');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
