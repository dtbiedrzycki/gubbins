import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { ContributeDialog, type ContributeDialogProps } from './ContributeDialog';

function renderDialog(overrides: Partial<ContributeDialogProps> = {}) {
  const props: ContributeDialogProps = {
    slug: 'abc123', itemId: 'item-1', itemTitle: 'Stand mixer', remainingMinor: 28750,
    payment: { venmoHandle: 'my-venmo', zelleHandle: 'me@example.com' },
    onPledged: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return { props, ...render(<QueryClientProvider client={client}><ContributeDialog {...props} /></QueryClientProvider>) };
}

/** Records every pledge request body; answers 201 after an optional delay. */
function pledgeEndpoint(wait = 0) {
  const bodies: Record<string, unknown>[] = [];
  server.use(http.post('/api/lists/abc123/items/item-1/contributions', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    bodies.push(body);
    await delay(wait);
    return HttpResponse.json({ contributionId: 'c-1', itemId: 'item-1', amountMinor: body.amountMinor as number }, { status: 201 });
  }));
  return bodies;
}

async function continueWithTheRest(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('Cover the rest ($287.50)'));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('ContributeDialog', () => {
  it('offers to cover the rest, and carries that amount into the payment step', async () => {
    const user = userEvent.setup();
    renderDialog();
    await continueWithTheRest(user);
    expect(screen.getByLabelText('Amount (USD)')).toHaveValue('287.50');
  });

  it('offers no "cover the rest" when nothing remains', () => {
    renderDialog({ remainingMinor: 0 });
    expect(screen.queryByLabelText(/Cover the rest/)).not.toBeInTheDocument();
  });

  it('continues only with a valid amount, and says what one looks like', async () => {
    const user = userEvent.setup();
    renderDialog();
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();

    await user.type(screen.getByLabelText('Another amount'), '25.555');
    expect(next).toBeDisabled();
    expect(screen.getByText('Enter an amount like 25 or 25.50.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Another amount'));
    await user.type(screen.getByLabelText('Another amount'), '$25.50');
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByLabelText('Amount (USD)')).toHaveValue('25.50');
  });

  it.each([
    ['Venmo', { venmoHandle: 'my-venmo', zelleHandle: null }],
    ['Zelle', { venmoHandle: null, zelleHandle: 'me@example.com' }],
    ['Venmo or Zelle', { venmoHandle: 'my-venmo', zelleHandle: 'me@example.com' }],
  ])('names %s as the way to pay in the first step', async (waysToPay, payment) => {
    const user = userEvent.setup();
    renderDialog({ payment });
    await continueWithTheRest(user);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(`Check the amount, then send it with ${waysToPay}.`);
  });

  it('lists the steps to pay and then record the gift', async () => {
    const user = userEvent.setup();
    renderDialog({ payment: { venmoHandle: null, zelleHandle: 'me@example.com' } });
    await continueWithTheRest(user);
    expect(screen.getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'Check the amount, then send it with Zelle.',
      'Once it has gone through, come back to this page.',
      'Add your name and choose \u201cI\'ve sent it\u201d, so the list shows your gift.',
    ]);
  });

  it("links to Venmo's payment link with the amount and the item as the note", async () => {
    const user = userEvent.setup();
    renderDialog();
    await continueWithTheRest(user);
    expect(screen.getByRole('link', { name: 'Pay $287.50 with Venmo' })).toHaveAttribute('href', 'https://venmo.com/my-venmo?txn=pay&amount=287.50&note=Stand%20mixer');
  });

  it('offers no Venmo link without a Venmo handle', async () => {
    const user = userEvent.setup();
    renderDialog({ payment: { venmoHandle: null, zelleHandle: 'me@example.com' } });
    await continueWithTheRest(user);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('copies the Zelle handle and says so', async () => {
    const user = userEvent.setup();
    renderDialog();
    await continueWithTheRest(user);
    const announcement = screen.getByRole('status');
    expect(announcement).toBeEmptyDOMElement();

    expect(screen.getByText('Zelle: me@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await expect(navigator.clipboard.readText()).resolves.toBe('me@example.com');
    expect(announcement).toHaveTextContent('Copied.');
  });

  it('needs a name before the pledge can be sent', async () => {
    const user = userEvent.setup();
    renderDialog();
    await continueWithTheRest(user);
    expect(screen.getByLabelText('Your name')).toBeRequired();
    expect(screen.getByRole('button', { name: "I've sent it" })).toBeDisabled();
  });

  it.each([
    { label: 'Your name', max: 100 },
    { label: 'Message to the owner (optional)', max: 300 },
  ])('cuts a paste into "$label" at $max characters, and warns that it may have been cut', async ({ label, max }) => {
    const user = userEvent.setup();
    renderDialog();
    await continueWithTheRest(user);
    const input = screen.getByLabelText(label);
    await user.click(input);
    await user.paste('a'.repeat(max - 1));
    expect(input).not.toHaveAccessibleDescription(/cut off/);
    await user.clear(input);
    await user.paste('a'.repeat(max + 5));
    expect(input).toHaveValue('a'.repeat(max));
    expect(input).toHaveAccessibleDescription(new RegExp(`limit of ${max} characters.*cut off`));
    expect(screen.getByText(/cut off/)).toHaveAttribute('aria-live', 'polite');
  });

  it('records the pledge with the trimmed details and reports the amount', async () => {
    const bodies = pledgeEndpoint();
    const user = userEvent.setup();
    const { props } = renderDialog();
    await continueWithTheRest(user);
    await user.type(screen.getByLabelText('Your name'), ' Amara ');
    await user.type(screen.getByLabelText('Message to the owner (optional)'), ' Enjoy! ');
    await user.click(screen.getByRole('button', { name: "I've sent it" }));

    await vi.waitFor(() => expect(props.onPledged).toHaveBeenCalledWith(28750));
    expect(bodies).toEqual([{ idempotencyKey: expect.any(String), amountMinor: 28750, name: 'Amara', message: 'Enjoy!' }]);
  });

  it('sends one request for two fast taps, and cannot be escaped meanwhile', async () => {
    const bodies = pledgeEndpoint(50);
    const user = userEvent.setup();
    const { props } = renderDialog();
    await continueWithTheRest(user);
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    const send = screen.getByRole('button', { name: "I've sent it" });
    await user.dblClick(send);

    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(props.onPledged).toHaveBeenCalled());
    expect(bodies).toHaveLength(1);
  });

  it("shows the server's reason in the alert region, and keeps what was sent locked for a retry", async () => {
    const message = 'That amount is more than this gift can take. Try a smaller amount.';
    server.use(mock('post', '/api/lists/{slug}/items/{itemId}/contributions', 409, { code: 'amount_out_of_range', message }));
    const user = userEvent.setup();
    renderDialog();
    await continueWithTheRest(user);
    const alert = screen.getByRole('alert');
    expect(alert).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: "I've sent it" }));

    await vi.waitFor(() => expect(alert).toHaveTextContent(message));
    for (const label of ['Amount (USD)', 'Your name', 'Message to the owner (optional)']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly');
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(expect.stringContaining('To change your details, cancel and start again.'));
    }
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
