import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { mock } from '../../test/msw/mock';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { GuestKeyGate } from './GuestKeyGate';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('GuestKeyGate', () => {
  it('calls onSuccess after a valid key is accepted', async () => {
    server.use(mock('post', '/api/lists/{slug}/session', 200, { ok: true }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Enter the guest key'), 'correct-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('sends the key trimmed', async () => {
    let body: unknown;
    server.use(http.post('/api/lists/:slug/session', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ok: true });
    }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Enter the guest key'), ' correct-key ');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(body).toEqual({ key: 'correct-key' });
  });

  it('shows the same generic not-found message on a wrong key as on any other failure', async () => {
    server.use(mock('post', '/api/lists/{slug}/session', 404, { message: 'Not found' }));
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={() => {}} />);

    // Screen readers miss a live region that arrives already holding its text.
    const alert = screen.getByRole('alert');
    expect(alert).toBeEmptyDOMElement();

    await user.type(screen.getByLabelText('Enter the guest key'), 'wrong-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(alert).toHaveTextContent('This list could not be found.'));
    expect(screen.getByRole('alert')).toBe(alert);
  });
});
