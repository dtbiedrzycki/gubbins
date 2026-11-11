import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { listViewKey, useListView } from './useListView';
import { YourHolds } from './YourHolds';
import { formatExpiry } from './formatExpiry';
import { aListItem } from '../../test/listItem';
import { aHoldView } from '../../test/holdView';

const EXPIRES = '2026-01-04T00:00:00.000Z';
const EXTENDED_EXPIRES = '2026-01-07T00:00:00.000Z';
const active = aHoldView({ expiresAt: EXPIRES });
const extended: HoldView = { ...active, expiresAt: EXTENDED_EXPIRES, extendedAt: '2026-01-02T00:00:00.000Z', actions: { extend: false, release: true, purchase: true } };
const expiredBuyable: HoldView = { ...active, status: 'expired', actions: { extend: false, release: false, purchase: true } };
const purchased: HoldView = { ...active, status: 'purchased', purchasedUnits: 1, purchasableUnits: 0, actions: { extend: false, release: false, purchase: false } };

const list = (myHolds: HoldView[]): ListViewResponse => ({
  title: 'Baby Shower', description: null,
  items: [aListItem({ status: myHolds.length ? 'held' : 'available', availableUnits: myHolds.length ? 0 : 1 })],
  payment: { venmoHandle: null, zelleHandle: null },
  myHolds, myContributions: [], capabilities: { holdDurationDays: 3 },
});

/** Serves each list view in turn on successive GETs, then keeps serving the last one. */
function listViews(...views: ListViewResponse[]) {
  let served = 0;
  server.use(http.get('/api/lists/abc123', () => HttpResponse.json(views[Math.min(served++, views.length - 1)])));
}

/** YourHolds fed by a live list-view query, as ListPage feeds it. */
function Harness({ itemTitle }: { itemTitle: string }) {
  const query = useListView('abc123');
  return query.data ? <YourHolds slug="abc123" holds={query.data.myHolds} itemTitles={{ 'item-1': itemTitle }} /> : null;
}

let client: QueryClient;

async function renderYourHolds(itemTitle = 'Stroller') {
  // useListView's own retry wins over these defaults; retryDelay: 0 keeps its one retry instant.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness itemTitle={itemTitle} /></QueryClientProvider>);
  return screen.findByRole('region', { name: 'Your holds' });
}

describe('YourHolds', () => {
  it('shows an active hold with a red wax seal, its expiry and every action the server offers', async () => {
    listViews(list([active]));
    const region = await renderYourHolds();

    expect(region.querySelector('[data-seal]')).toHaveAttribute('data-seal', 'red-wax');
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

  it('shows a purchased hold as done, with a gold wax seal and no actions', async () => {
    listViews(list([purchased]));
    const region = await renderYourHolds();

    expect(within(region).getByText('Marked as purchased.')).toBeInTheDocument();
    expect(region.querySelector('[data-seal]')).toHaveAttribute('data-seal', 'gold-wax');
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

  it('clears the last announcement when the guest starts another action', async () => {
    listViews(list([active]), list([extended]), list([purchased]));
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => { respond = resolve; });
    server.use(
      mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 200, extended),
      http.post('/api/lists/abc123/holds/hold-1/purchase', async () => {
        await responded;
        return HttpResponse.json(purchased);
      }),
    );
    const user = userEvent.setup();
    const region = await renderYourHolds();
    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Hold extended until'));

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' }));

    expect(within(region).getByRole('status')).toBeEmptyDOMElement();

    // Let the request finish inside the test, so nothing settles after teardown.
    respond();
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
  });

  it('stamps the seal, through motion-safe only, on a hold that appears while the page is open, and leaves earlier holds still', async () => {
    const second: HoldView = { ...active, holdId: 'hold-2' };
    listViews(list([active]), list([active, second]));
    const region = await renderYourHolds();

    await client.invalidateQueries();

    await waitFor(() => expect(region.querySelectorAll('[data-seal]')).toHaveLength(2));
    const [earlier, appeared] = [...region.querySelectorAll('[data-seal]')].map((seal) => seal.className.split(' '));
    expect(earlier.filter((token) => token.includes('animate-stamp'))).toEqual([]);
    expect(appeared.filter((token) => token.includes('animate-stamp'))).toEqual(['motion-safe:animate-stamp']);
  });

  it('shows no seal on an expired hold', async () => {
    listViews(list([expiredBuyable]));
    const region = await renderYourHolds();

    expect(region.querySelector('[data-seal]')).toBeNull();
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
    if (action === 'purchase') await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' }));

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

  it('keeps an announcement a new hold doesn\'t contradict', async () => {
    const second: HoldView = { ...active, holdId: 'hold-2' };
    listViews(list([active]), list([extended]), list([extended, second]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 200, extended));
    const user = userEvent.setup();
    const region = await renderYourHolds();
    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Hold extended until'));

    // A hold placed in another tab arrives with the next refetch.
    await client.invalidateQueries();

    await waitFor(() => expect(within(region).getAllByRole('listitem')).toHaveLength(2));
    expect(within(region).getByRole('status')).toHaveTextContent('Hold extended until');
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
    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    const buy = within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' });

    await user.click(buy);
    await user.click(buy);

    for (const button of [...within(region).getAllByRole('button'), ...within(screen.getByRole('dialog')).getAllByRole('button')]) expect(button).toBeDisabled();
    expect(requests).toBe(1);

    // Let the one request finish inside the test, so nothing settles after teardown.
    respond();
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
  });

  it('shows "× 2" for a hold of 2 units', async () => {
    listViews(list([{ ...active, units: 2, purchasableUnits: 2 }, { ...active, holdId: 'hold-2' }]));
    const region = await renderYourHolds();

    expect(within(region).getAllByText(/^× /).map((count) => count.textContent)).toEqual(['× 2']);
  });

  it('shows "× 2" for 2 units bought, and none for 1 bought', async () => {
    listViews(list([{ ...purchased, units: 3, purchasedUnits: 2 }, { ...purchased, holdId: 'hold-2', units: 2, purchasedUnits: 1 }]));
    const region = await renderYourHolds();

    expect(within(region).getAllByText(/^× /).map((count) => count.textContent)).toEqual(['× 2']);
  });

  it('opens the purchase sheet for a one-unit hold instead of purchasing at once', async () => {
    listViews(list([active]));
    let requests = 0;
    server.use(http.post('/api/lists/abc123/holds/hold-1/purchase', () => {
      requests += 1;
      return HttpResponse.json(purchased);
    }));
    const user = userEvent.setup();
    const region = await renderYourHolds();
    const buy = within(region).getByRole('button', { name: 'Mark as purchased' });

    await user.click(buy);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(requests).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(buy).toHaveFocus();
  });

  it('sends the typed message with a one-unit purchase', async () => {
    listViews(list([active]));
    let sent: unknown;
    server.use(http.post('/api/lists/abc123/holds/hold-1/purchase', async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(purchased);
    }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.type(screen.getByLabelText('Message to the owner (optional)'), 'Congrats');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' }));

    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
    expect(sent).toEqual({ units: 1, message: 'Congrats' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the typed message when the purchase is refused as unavailable', async () => {
    const expired: HoldView = { ...expiredBuyable, units: 3, purchasableUnits: 3 };
    listViews(list([expired]), list([{ ...expired, purchasableUnits: 1 }]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'This item is no longer available.', code: 'item_unavailable' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.type(screen.getByLabelText('Message to the owner (optional)'), 'Congrats');
    await user.click(screen.getByRole('button', { name: 'Mark 3 as purchased' }));

    const sheet = screen.getByRole('dialog', { name: 'How many did you buy?' });
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Mark 1 as purchased' })).toBeEnabled());
    expect(within(sheet).getByLabelText('Message to the owner (optional)')).toHaveValue('Congrats');
  });

  it('says "Baby onesies: 1 marked as purchased. Thank you!"', async () => {
    const two: HoldView = { ...active, units: 2, purchasableUnits: 2 };
    const bought: HoldView = { ...purchased, units: 2, purchasedUnits: 1, purchasableUnits: 0 };
    listViews(list([two]), list([bought]));
    let units: unknown;
    server.use(http.post('/api/lists/abc123/holds/hold-1/purchase', async ({ request }) => {
      ({ units } = await request.json() as { units: number });
      return HttpResponse.json(bought);
    }));
    const user = userEvent.setup();
    const region = await renderYourHolds('Baby onesies');

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'One fewer' }));
    await user.click(screen.getByRole('button', { name: 'Mark 1 as purchased' }));

    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Baby onesies: 1 marked as purchased. Thank you!'));
    expect(units).toBe(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Baby onesies' })).toHaveFocus();
  });

  it('after a refusal, keeps the purchase sheet open and caps it at the units still free', async () => {
    const expired: HoldView = { ...expiredBuyable, units: 3, purchasableUnits: 3 };
    listViews(list([expired]), list([{ ...expired, purchasableUnits: 1 }]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'This item is no longer available.', code: 'item_unavailable' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'Mark 3 as purchased' }));

    const sheet = screen.getByRole('dialog', { name: 'How many did you buy?' });
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Mark 1 as purchased' })).toBeEnabled());
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Only 1 is still free to mark as purchased.');
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes the purchase sheet on a refusal for a hold the refetch removes, and shows why beside "Your holds"', async () => {
    // Released in another tab while the sheet was open, so the refetch drops it.
    listViews(list([{ ...active, units: 2, purchasableUnits: 2 }]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'Mark 2 as purchased' }));

    await waitFor(() => expect(within(region).getByRole('alert')).toHaveTextContent('This hold is no longer active.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Your holds' })).toHaveFocus();
  });

  it('closes the purchase sheet when the refusal leaves nothing to buy, and shows why beside "Your holds"', async () => {
    const expired: HoldView = { ...expiredBuyable, units: 3, purchasableUnits: 3 };
    const lapsed: HoldView = { ...expired, purchasableUnits: 0, actions: { extend: false, release: false, purchase: false } };
    // Another guest then releases a unit, so the hold can be bought again.
    listViews(list([expired]), list([lapsed]), list([{ ...expired, purchasableUnits: 1 }]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'Your hold expired and this gift has since been held or bought by someone else.', code: 'item_unavailable' }));
    const user = userEvent.setup();
    const region = await renderYourHolds();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'Mark 3 as purchased' }));

    await waitFor(() => expect(within(region).getByRole('alert')).toHaveTextContent('Your hold expired and this gift has since been held or bought by someone else.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Your holds' })).toHaveFocus();

    await client.invalidateQueries({ queryKey: listViewKey('abc123') });

    const markAsPurchased = await within(region).findByRole('button', { name: 'Mark as purchased' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(markAsPurchased);

    expect(within(screen.getByRole('dialog', { name: 'How many did you buy?' })).getByRole('alert')).toBeEmptyDOMElement();
  });
});
