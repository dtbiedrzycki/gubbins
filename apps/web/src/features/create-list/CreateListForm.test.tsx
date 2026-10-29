import type { ReactElement } from 'react';
import type { CreateListResponse } from '@gubbins/shared-types';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from '../../test/msw/mock';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { CreateListForm } from './CreateListForm';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

async function fillAndSubmit(beforeSubmit: (user: ReturnType<typeof userEvent.setup>) => void | Promise<void> = () => {}) {
  const user = userEvent.setup();
  renderWithQueryClient(<CreateListForm />);
  await beforeSubmit(user);
  await user.type(screen.getByLabelText('List title'), 'Baby Shower');
  await user.type(screen.getByLabelText('First item'), 'Stroller');
  await user.type(screen.getByLabelText('Create secret'), 'the-secret');
  await user.click(screen.getByRole('button', { name: 'Create list' }));
}

describe('CreateListForm', () => {
  it('shows the guest link, guest key, and owner token after a successful submit', async () => {
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'owner-secret-token', key: 'guest-key-value', itemId: 'item-1' }));
    await fillAndSubmit();

    expect(await screen.findByText('guest-key-value')).toBeInTheDocument();
    expect(screen.getByText('owner-secret-token')).toBeInTheDocument();
    expect(screen.getByTestId('guest-link')).toHaveAttribute('href', '/wishlists/abc123');
  });

  it('never renders the owner token inside a link href (ADR-062)', async () => {
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'owner-secret-token', key: 'guest-key-value', itemId: 'item-1' }));
    await fillAndSubmit();
    await screen.findByText('owner-secret-token');

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toContain('owner-secret-token');
    }
  });

  it('shows the server error message when the request fails', async () => {
    server.use(mock('post', '/api/lists', 400, { message: 'Invalid request' }));
    // Screen readers miss a live region that arrives already holding its text.
    let alert: HTMLElement | undefined;
    await fillAndSubmit(() => {
      alert = screen.getByRole('alert');
      expect(alert).toBeEmptyDOMElement();
    });

    await waitFor(() => expect(alert).toHaveTextContent('Invalid request'));
    expect(screen.getByRole('alert')).toBe(alert);
  });

  it('sends both titles, the create secret and both payment handles, each trimmed', async () => {
    let body: unknown;
    server.use(http.post('/api/lists', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ slug: 'abc123', ownerToken: 'o', key: 'k', itemId: 'i' } satisfies CreateListResponse, { status: 201 });
    }));
    const user = userEvent.setup();
    renderWithQueryClient(<CreateListForm />);
    await user.type(screen.getByLabelText('List title'), ' Baby Shower ');
    await user.type(screen.getByLabelText('First item'), ' Stroller ');
    await user.type(screen.getByLabelText('Create secret'), ' the-secret ');
    await user.type(screen.getByLabelText('Venmo username'), ' @my-venmo ');
    await user.type(screen.getByLabelText('Zelle email or US phone'), ' me@example.com ');
    await user.click(screen.getByRole('button', { name: 'Create list' }));
    await screen.findByText('k');
    expect(body).toMatchObject({
      listTitle: 'Baby Shower', itemTitle: 'Stroller', createSecret: 'the-secret', venmoHandle: '@my-venmo', zelleHandle: 'me@example.com',
    });
  });

  it('limits the list and first item titles to 120 characters, the Venmo username to 31 and the Zelle handle to 254', () => {
    renderWithQueryClient(<CreateListForm />);
    expect(screen.getByLabelText('List title')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('First item')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('Venmo username')).toHaveAttribute('maxlength', '31');
    expect(screen.getByLabelText('Zelle email or US phone')).toHaveAttribute('maxlength', '254');
  });

  it('explains that group gifts need a handle and handles are permanent', () => {
    renderWithQueryClient(<CreateListForm />);
    const hint = "Group gifts need at least one handle. Handles can't be changed later.";
    expect(screen.getByLabelText('Venmo username')).toHaveAccessibleDescription(hint);
    expect(screen.getByLabelText('Zelle email or US phone')).toHaveAccessibleDescription(hint);
  });

  it('links to the manage page without the owner token and tells the owner to save it', async () => {
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'owner-secret-token', key: 'guest-key-value', itemId: 'item-1' }));
    await fillAndSubmit();

    const link = await screen.findByRole('link', { name: 'Manage your list (opens in a new tab)' });
    expect(link).toHaveAttribute('href', '/wishlists/abc123/manage');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText("Save your owner token now: you'll need it to manage the list, and it isn't shown again.")).toBeInTheDocument();
  });
});
