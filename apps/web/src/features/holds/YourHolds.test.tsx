import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { useListView } from './useListView';
import { YourHolds } from './YourHolds';
import { formatExpiry } from './formatExpiry';

const EXPIRES = '2026-01-04T00:00:00.000Z';
const EXTENDED_EXPIRES = '2026-01-07T00:00:00.000Z';
const active: HoldView = { holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: EXPIRES, extendedAt: null, actions: { extend: true, release: true, purchase: true } };
const extended: HoldView = { ...active, expiresAt: EXTENDED_EXPIRES, extendedAt: '2026-01-02T00:00:00.000Z', actions: { extend: false, release: true, purchase: true } };
const expiredBuyable: HoldView = { ...active, status: 'expired', actions: { extend: false, release: false, purchase: true } };
const purchased: HoldView = { ...active, status: 'purchased', actions: { extend: false, release: false, purchase: false } };

const list = (myHolds: HoldView[]): ListViewResponse => ({
  title: 'Baby Shower', item: { id: 'item-1', title: 'Stroller', status: myHolds.length ? 'held' : 'available' },
  myHolds, capabilities: { holdDurationDays: 3 },
});

/** Serves each list view in turn on successive GETs, then keeps serving the last one. */
function listViews(...views: ListViewResponse[]) {
  let served = 0;
  server.use(http.get('/api/lists/abc123', () => HttpResponse.json(views[Math.min(served++, views.length - 1)])));
}

/** YourHolds fed by a live list-view query, as ListPage feeds it. */
function Harness() {
  const query = useListView('abc123');
  return query.data ? <YourHolds slug="abc123" holds={query.data.myHolds} itemTitles={{ 'item-1': 'Stroller' }} /> : null;
}

let client: QueryClient;

async function renderYourHolds() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  return screen.findByRole('region', { name: 'Your holds' });
}

describe('YourHolds', () => {
  it('shows an active hold with its expiry and every action the server offers', async () => {
    listViews(list([active]));
    const region = await renderYourHolds();

    expect(within(region).getByText(`Held until ${formatExpiry(EXPIRES)}.`)).toBeInTheDocument();
    for (const name of ['Mark as purchased', 'Extend hold', 'Release hold']) {
      expect(within(region).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('offers only purchase on an expired hold the server says can still be bought', async () => {
    listViews(list([expiredBuyable]));
    const region = await renderYourHolds();

    expect(within(region).getByText(`Your hold expired on ${formatExpiry(EXPIRES)}. You can still mark it as purchased.`)).toBeInTheDocument();
    expect(within(region).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mark as purchased']);
  });

  it('shows a purchased hold as done, with no actions', async () => {
    listViews(list([purchased]));
    const region = await renderYourHolds();

    expect(within(region).getByText('Marked as purchased.')).toBeInTheDocument();
    expect(within(region).queryAllByRole('button')).toEqual([]);
  });

  it('says where holds will appear when there are none', async () => {
    listViews(list([]));
    expect(within(await renderYourHolds()).getByText('Holds you place appear here.')).toBeInTheDocument();
  });

  it('extends, announces the new expiry, and stops offering extend', async () => {
    listViews(list([active]), list([extended]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 200, extended));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent(`Hold extended until ${formatExpiry(EXTENDED_EXPIRES)}.`));
    expect(within(region).queryByRole('button', { name: 'Extend hold' })).not.toBeInTheDocument();
    expect(within(region).getByText(`Held until ${formatExpiry(EXTENDED_EXPIRES)} (extended).`)).toBeInTheDocument();
  });

  it('asks before releasing, and still announces the release once the hold has gone', async () => {
    listViews(list([active]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    expect(within(region).getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Keep my hold' }));
    expect(within(region).getByRole('button', { name: 'Release hold' })).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(within(region).getByText('Holds you place appear here.')).toBeInTheDocument());
    expect(within(region).getByRole('status')).toHaveTextContent('Your hold on Stroller is released.');
  });

  it('moves focus into the release question, and back to the Release button when the guest keeps the hold', async () => {
    listViews(list([active]));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    expect(within(region).getByRole('button', { name: 'Keep my hold' })).toHaveFocus();
    await user.click(within(region).getByRole('button', { name: 'Keep my hold' }));
    expect(within(region).getByRole('button', { name: 'Release hold' })).toHaveFocus();
  });

  it('explains a refusal and refetches, so the card shows the hold as it really is', async () => {
    listViews(list([active]), list([expiredBuyable]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('alert')).toHaveTextContent('This hold is no longer active.'));
    await waitFor(() => expect(within(region).queryByRole('button', { name: 'Extend hold' })).not.toBeInTheDocument());
    expect(within(region).getByText(/^Your hold expired on /)).toBeInTheDocument();
  });

  it('still explains a refusal when the refetch shows the hold was already released elsewhere', async () => {
    listViews(list([active]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByText('Holds you place appear here.')).toBeInTheDocument());
    expect(within(region).getByRole('alert')).toHaveTextContent('This hold is no longer active.');
  });

  it('explains a not-found hold in words a guest can act on, not the bare "Not found"', async () => {
    listViews(list([active]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 404, { message: 'Not found' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('alert'))
      .toHaveTextContent("We couldn't find this hold. Reload the page to see your holds."));
  });

  it('explains a network failure in plain words, not the browser\'s fetch error', async () => {
    listViews(list([active]));
    server.use(http.post('/api/lists/abc123/holds/hold-1/extend', () => HttpResponse.error()));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('alert'))
      .toHaveTextContent("Couldn't reach the server. Check your connection and try again."));
  });

  it('clears the last announcement when the guest starts another action', async () => {
    listViews(list([active]), list([extended]));
    server.use(
      mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 200, extended),
      http.post('/api/lists/abc123/holds/hold-1/purchase', () => new Promise<never>(() => {})),
    );
    const user = userEvent.setup();
    const region = await renderYourHolds();
    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Hold extended until'));

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));

    expect(within(region).getByRole('status')).toBeEmptyDOMElement();
  });

  it('clears the last announcement when a new hold appears', async () => {
    const second: HoldView = { ...active, holdId: 'hold-2' };
    listViews(list([active]), list([]), list([second]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const user = userEvent.setup();
    const region = await renderYourHolds();
    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Your hold on Stroller is released.'));

    // The guest holds the item again from the item view, which refetches the list.
    await client.invalidateQueries();

    await waitFor(() => expect(within(region).getByRole('button', { name: 'Release hold' })).toBeInTheDocument());
    expect(within(region).getByRole('status')).toBeEmptyDOMElement();
  });

  it.each([
    ['extend', 'Extend hold', extended, 'Stroller'],
    ['purchase', 'Mark as purchased', purchased, 'Stroller'],
] as const)('after %s, moves focus to the hold\'s heading, since the pressed button is gone', async (action, button, after, heading) => {
    listViews(list([active]), list([after]));
    server.use(mock('post', `/api/lists/{slug}/holds/{holdId}/${action}`, 200, after));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: button }));

    await waitFor(() => expect(within(region).getByRole('heading', { name: heading })).toHaveFocus());
  });

  it('after a release, moves focus to the Your holds heading, since the card is gone', async () => {
    listViews(list([active]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(within(region).getByRole('heading', { name: 'Your holds' })).toHaveFocus());
  });

  it('keeps focus on the release question, not a disabled button, while the release is in flight', async () => {
    listViews(list([active]), list([]));
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => { respond = resolve; });
    server.use(http.post('/api/lists/abc123/holds/hold-1/release', async () => {
      await responded;
      return HttpResponse.json({ ...active, status: 'released', actions: { extend: false, release: false, purchase: false } });
    }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(within(region).getByRole('button', { name: 'Yes, release it' })).toBeDisabled());
    expect(within(region).getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toHaveFocus();

    respond();
    await waitFor(() => expect(within(region).getByRole('heading', { name: 'Your holds' })).toHaveFocus());
  });

  it('after a refusal, moves focus to the Your holds heading, beside the explanation', async () => {
    listViews(list([active]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('heading', { name: 'Your holds' })).toHaveFocus());
  });

  it('disables every action on the hold while one is in flight, so a double tap sends one request', async () => {
    listViews(list([active]));
    let requests = 0;
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => { respond = resolve; });
    server.use(http.post('/api/lists/abc123/holds/hold-1/purchase', async () => {
      requests += 1;
      await responded;
      return HttpResponse.json(purchased);
    }));
    const user = userEvent.setup();
    const region = await renderYourHolds();
    const buy = within(region).getByRole('button', { name: 'Mark as purchased' });

    await user.click(buy);
    await user.click(buy);

    for (const button of within(region).getAllByRole('button')) expect(button).toBeDisabled();
    expect(requests).toBe(1);

    // Let the one request finish inside the test, so nothing settles after teardown.
    respond();
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
  });
});
