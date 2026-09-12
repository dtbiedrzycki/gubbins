import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { GuestKeyGate } from './GuestKeyGate';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('GuestKeyGate', () => {
  it('calls onSuccess after a valid key is accepted', async () => {
    server.use(http.post('/api/lists/abc123/session', () => HttpResponse.json({ ok: true }, { status: 200 })));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Enter the guest key'), 'correct-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('shows the same generic not-found message on a wrong key as on any other failure', async () => {
    server.use(http.post('/api/lists/abc123/session', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={() => {}} />);

    await user.type(screen.getByLabelText('Enter the guest key'), 'wrong-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This list could not be found.');
  });
});
