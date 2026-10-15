import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mock } from '../../test/msw/mock';
import { server } from '../../test/msw/server';
import { OwnerTokenGate } from './OwnerTokenGate';

function renderWithQueryClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe('OwnerTokenGate', () => {
  it('hides the token as it is typed and calls onSuccess once it is accepted', async () => {
    let body: unknown;
    server.use(http.post('/api/lists/:slug/owner-session', async ({ request }) => { body = await request.json(); return HttpResponse.json({ ok: true }); }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<OwnerTokenGate slug="abc123" onSuccess={onSuccess} />);

    const input = screen.getByLabelText('Owner token');
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, ' the-token ');
    await user.click(screen.getByRole('button', { name: 'Manage list' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(body).toEqual({ ownerToken: 'the-token' });
  });

  it('says the token does not match when the server answers 404', async () => {
    server.use(mock('post', '/api/lists/{slug}/owner-session', 404, { message: 'Not found' }));
    const user = userEvent.setup();
    renderWithQueryClient(<OwnerTokenGate slug="abc123" onSuccess={() => {}} />);

    // Screen readers miss a live region that arrives already holding its text.
    const alert = screen.getByRole('alert');
    expect(alert).toBeEmptyDOMElement();

    await user.type(screen.getByLabelText('Owner token'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Manage list' }));

    await waitFor(() => expect(alert).toHaveTextContent("That token doesn't match this list."));
  });

  it('focuses the token field and describes it with the notice when sent back', () => {
    renderWithQueryClient(<OwnerTokenGate slug="abc123" onSuccess={() => {}} notice="Enter your owner token again." />);

    const input = screen.getByLabelText('Owner token');
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription('Enter your owner token again.');
  });
});
