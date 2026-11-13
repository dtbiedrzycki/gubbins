import type { ReactElement } from 'react';
import type { EnterGuestKeyResponse } from '@gubbins/shared-types';
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
  it('greets the guest at the door and says where the key is', () => {
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Knock, knock.' })).toBeInTheDocument();
    expect(screen.getByText(/This is a/)).toHaveTextContent(
      'This is a gift list on Gubbins, a small wishlist app with no accounts, no ads and no tracking.',
    );
    expect(screen.getByText('Enter the guest key from your invite to see what they’re hoping for.')).toBeInTheDocument();

    const input = screen.getByLabelText('Guest key');
    const hint = screen.getByText('The list owner sent it with your invite: three words joined by dashes.');
    expect(input).toHaveAccessibleDescription(hint.textContent!);
    expect(input).toHaveAttribute('placeholder', 'maple-lantern-otter');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('calls onSuccess after a valid key is accepted', async () => {
    server.use(mock('post', '/api/lists/{slug}/session', 200, { ok: true }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Guest key'), 'correct-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('sends the key trimmed', async () => {
    let body: unknown;
    server.use(http.post('/api/lists/:slug/session', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ok: true } satisfies EnterGuestKeyResponse);
    }));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Guest key'), ' correct-key ');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(body).toEqual({ key: 'correct-key' });
  });

  it('says the list could not be found when the key is refused', async () => {
    server.use(mock('post', '/api/lists/{slug}/session', 404, { message: 'Not found' }));
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={async () => {}} />);

    // Screen readers miss a live region that arrives already holding its text.
    const alert = screen.getByRole('alert');
    expect(alert).toBeEmptyDOMElement();

    await user.type(screen.getByLabelText('Guest key'), 'wrong-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(alert).toHaveTextContent('This list could not be found.'));
    expect(screen.getByRole('alert')).toBe(alert);
  });

  it.each([
    ['offline', 0, 'Couldn’t check the key. You seem to be offline. Check your connection, then try again.'],
    ['status 429', 429, 'Couldn’t check the key. Something went wrong on our end. Wait a moment, then try again.'],
    ['status 500', 500, 'Couldn’t check the key. Something went wrong on our end. Wait a moment, then try again.'],
  ])('asks the guest to try again when checking fails: %s', async (_case, status, text) => {
    server.use(http.post('/api/lists/:slug/session', () => (
      status === 0 ? HttpResponse.error() : HttpResponse.json({ message: 'Too many requests from 10.0.0.1' }, { status })
    )));
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={async () => {}} />);

    await user.type(screen.getByLabelText('Guest key'), 'some-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));
  });

  it('keeps the button busy until the list has loaded', async () => {
    server.use(mock('post', '/api/lists/{slug}/session', 200, { ok: true }));
    let finish!: () => void;
    const onSuccess = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    renderWithQueryClient(<GuestKeyGate slug="abc123" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Guest key'), 'correct-key');
    await user.click(screen.getByRole('button', { name: 'View list' }));

    expect(await screen.findByRole('button', { name: 'Opening…' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'View list' })).toBeEnabled());
  });

});
