import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from '../../test/msw/mock';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { CreateListForm } from './CreateListForm';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

async function fillAndSubmit(beforeSubmit = () => {}) {
  const user = userEvent.setup();
  renderWithQueryClient(<CreateListForm />);
  beforeSubmit();
  await user.type(screen.getByLabelText('List title'), 'Baby Shower');
  await user.type(screen.getByLabelText('First item'), 'Stroller');
  await user.click(screen.getByRole('button', { name: 'Create list' }));
}

describe('CreateListForm', () => {
  it('shows the guest link, guest key, and owner token after a successful submit', async () => {
    server.use(mock('post', '/api/lists', 201, { slug: 'abc123', ownerToken: 'owner-secret-token', key: 'guest-key-value', itemId: 'item-1' }));
    await fillAndSubmit();

    expect(await screen.findByText('guest-key-value')).toBeInTheDocument();
    expect(screen.getByText('owner-secret-token')).toBeInTheDocument();
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
});
