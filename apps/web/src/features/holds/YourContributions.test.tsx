import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { listViewKey, useListView } from './useListView';
import { YourContributions } from './YourContributions';
import { formatExpiry } from './formatExpiry';
import { aListItem } from '../../test/listItem';
import { aHoldView } from '../../test/holdView';

const EXPIRES = '2026-01-04T00:00:00.000Z';
const EXTENDED_EXPIRES = '2026-01-07T00:00:00.000Z';
const active = aHoldView({ expiresAt: EXPIRES });
const extended: HoldView = { ...active, expiresAt: EXTENDED_EXPIRES, extendedAt: '2026-01-02T00:00:00.000Z', actions: { extend: false, release: true, purchase: true } };
const expiredBuyable: HoldView = { ...active, status: 'expired', actions: { extend: false, release: false, purchase: true } };
const purchased: HoldView = { ...active, status: 'purchased', purchasedUnits: 1, purchasableUnits: 0, actions: { extend: false, release: false, purchase: false } };

type Pledge = ListViewResponse['myContributions'][number];
const pledge: Pledge = { contributionId: 'pledge-1', itemId: 'item-2', amountMinor: 4000, pledgedAt: '2026-01-02T00:00:00.000Z' };

const list = (myHolds: HoldView[], myContributions: Pledge[] = []): ListViewResponse => ({
  title: 'Baby Shower', description: null,
  items: [aListItem({ status: myHolds.length ? 'held' : 'available', availableUnits: myHolds.length ? 0 : 1 })],
  payment: { venmoHandle: null, zelleHandle: null },
  myHolds, myContributions, capabilities: { holdDurationDays: 3 },
});

/** Serves each list view in turn on successive GETs, then keeps serving the last one. */
function listViews(...views: ListViewResponse[]) {
  let served = 0;
  server.use(http.get('/api/lists/abc123', () => HttpResponse.json(views[Math.min(served++, views.length - 1)])));
}

/** YourContributions fed by a live list-view query, as ListPage feeds it. */
function Harness({ itemTitle, onEmptied }: { itemTitle: string; onEmptied: () => void }) {
  const query = useListView('abc123');
  return query.data ? (
    <YourContributions slug="abc123" holds={query.data.myHolds} contributions={query.data.myContributions}
      itemTitles={{ 'item-1': itemTitle, 'item-2': 'Pram fund' }} onEmptied={onEmptied} />
  ) : null;
}

let client: QueryClient;

function renderYourContributions({ itemTitle = 'Stroller', onEmptied = () => {} } = {}) {
  // useListView's own retry wins over these defaults; retryDelay: 0 keeps its one retry instant.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Harness itemTitle={itemTitle} onEmptied={onEmptied} /></QueryClientProvider>);
}

/** Renders, then opens the sheet from its floating button. */
async function openYourContributions(options?: Parameters<typeof renderYourContributions>[0]) {
  renderYourContributions(options);
  await userEvent.setup().click(await screen.findByRole('button', { name: /^Your contributions · / }));
  return screen.getByRole('dialog', { name: 'Your contributions' });
}

describe('YourContributions', () => {
  it('shows an active hold with a red wax seal, its expiry and every action the server offers', async () => {
    listViews(list([active]));
    const region = await openYourContributions();

    expect(region.querySelector('[data-seal]')).toHaveAttribute('data-seal', 'red-wax');
    expect(within(region).getByText(`Held until ${formatExpiry(EXPIRES)}.`)).toBeInTheDocument();
    for (const name of ['Mark as purchased', 'Extend hold', 'Release hold']) {
      expect(within(region).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('offers only purchase on an expired hold the server says can still be bought', async () => {
    listViews(list([expiredBuyable]));
    const region = await openYourContributions();

    expect(within(region).getByText(`Your hold expired on ${formatExpiry(EXPIRES)}. You can still mark it as purchased.`)).toBeInTheDocument();
    expect(within(within(region).getByRole('listitem')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mark as purchased']);
  });

  it('shows a purchased hold as done, with a gold wax seal and no actions', async () => {
    listViews(list([purchased]));
    const region = await openYourContributions();

    expect(within(region).getByText('Marked as purchased.')).toBeInTheDocument();
    expect(region.querySelector('[data-seal]')).toHaveAttribute('data-seal', 'gold-wax');
    expect(within(within(region).getByRole('listitem')).queryAllByRole('button')).toEqual([]);
  });


  it('extends, announces the new expiry, and stops offering extend', async () => {
    listViews(list([active]), list([extended]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 200, extended));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent(`Hold extended until ${formatExpiry(EXTENDED_EXPIRES)}.`));
    expect(within(region).queryByRole('button', { name: 'Extend hold' })).not.toBeInTheDocument();
    expect(within(region).getByText(`Held until ${formatExpiry(EXTENDED_EXPIRES)} (extended).`)).toBeInTheDocument();
  });

  it('asks before releasing, and still announces the release once the hold has gone', async () => {
    listViews(list([active], [pledge]), list([], [pledge]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    expect(within(region).getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Keep my hold' }));
    expect(within(region).getByRole('button', { name: 'Release hold' })).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(within(region).queryByRole('heading', { name: 'Stroller' })).not.toBeInTheDocument());
    expect(within(region).getByRole('status')).toHaveTextContent('Your hold on Stroller is released.');
  });

  it('moves focus into the release question, and back to the Release button when the guest keeps the hold', async () => {
    listViews(list([active]));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    expect(within(region).getByRole('button', { name: 'Keep my hold' })).toHaveFocus();
    await user.click(within(region).getByRole('button', { name: 'Keep my hold' }));
    expect(within(region).getByRole('button', { name: 'Release hold' })).toHaveFocus();
  });

  it('explains a refusal and refetches, so the card shows the hold as it really is', async () => {
    listViews(list([active]), list([expiredBuyable]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('alert')).toHaveTextContent('This hold is no longer active.'));
    await waitFor(() => expect(within(region).queryByRole('button', { name: 'Extend hold' })).not.toBeInTheDocument());
    expect(within(region).getByText(/^Your hold expired on /)).toBeInTheDocument();
  });

  it('still explains a refusal when the refetch shows the hold was already released elsewhere', async () => {
    listViews(list([active], [pledge]), list([], [pledge]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).queryByRole('heading', { name: 'Stroller' })).not.toBeInTheDocument());
    expect(within(region).getByRole('alert')).toHaveTextContent('This hold is no longer active.');
  });

  it('when a refusal removes the last entry, closes the sheet and still explains it', async () => {
    listViews(list([active]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(region).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('This hold is no longer active.');
  });

  it('explains a not-found hold in words a guest can act on, not the bare "Not found"', async () => {
    listViews(list([active]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 404, { message: 'Not found' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

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
    const region = await openYourContributions();
    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Hold extended until'));

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(within(within(region).getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' }));

    expect(within(region).getByRole('status')).toBeEmptyDOMElement();

    // Let the request finish inside the test, so nothing settles after teardown.
    respond();
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
  });

  it('stamps the seal, through motion-safe only, on a hold that appears while the page is open, and leaves earlier holds still', async () => {
    const second: HoldView = { ...active, holdId: 'hold-2' };
    listViews(list([active]), list([active, second]));
    const region = await openYourContributions();

    await client.invalidateQueries();

    await waitFor(() => expect(region.querySelectorAll('[data-seal]')).toHaveLength(2));
    const [earlier, appeared] = [...region.querySelectorAll('[data-seal]')].map((seal) => seal.className.split(' '));
    expect(earlier.filter((token) => token.includes('animate-stamp'))).toEqual([]);
    expect(appeared.filter((token) => token.includes('animate-stamp'))).toEqual(['motion-safe:animate-stamp']);
  });

  it('shows no seal on an expired hold', async () => {
    listViews(list([expiredBuyable]));
    const region = await openYourContributions();

    expect(region.querySelector('[data-seal]')).toBeNull();
  });

  it('clears the last announcement when a new hold appears', async () => {
    const second: HoldView = { ...active, holdId: 'hold-2' };
    listViews(list([active], [pledge]), list([], [pledge]), list([second], [pledge]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const user = userEvent.setup();
    const region = await openYourContributions();
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
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: button }));
    if (action === 'purchase') await user.click(within(within(region).getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' }));

    await waitFor(() => expect(within(region).getByRole('heading', { name: heading })).toHaveFocus());
  });

  it('after a release with other entries left, moves focus to the sheet\'s heading', async () => {
    listViews(list([active], [pledge]), list([], [pledge]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(within(region).getByRole('heading', { name: 'Your contributions' })).toHaveFocus());
  });

  it('keeps focus on the release question, not a disabled button, while the release is in flight', async () => {
    listViews(list([active], [pledge]), list([], [pledge]));
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => { respond = resolve; });
    server.use(http.post('/api/lists/abc123/holds/hold-1/release', async () => {
      await responded;
      return HttpResponse.json({ ...active, status: 'released', actions: { extend: false, release: false, purchase: false } });
    }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(within(region).getByRole('button', { name: 'Yes, release it' })).toBeDisabled());
    expect(within(region).getByText('Release your hold on Stroller? Someone else will be able to hold it.')).toHaveFocus();

    // Let the request finish inside the test, so nothing settles after teardown.
    respond();
    await waitFor(() => expect(within(region).queryByRole('heading', { name: 'Stroller' })).not.toBeInTheDocument());
  });

  it('after a refusal, moves focus to the sheet\'s heading, beside the explanation', async () => {
    listViews(list([active], [pledge]), list([], [pledge]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Extend hold' }));

    await waitFor(() => expect(within(region).getByRole('heading', { name: 'Your contributions' })).toHaveFocus());
  });

  it('keeps an announcement a new hold doesn\'t contradict', async () => {
    const second: HoldView = { ...active, holdId: 'hold-2' };
    listViews(list([active]), list([extended]), list([extended, second]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 200, extended));
    const user = userEvent.setup();
    const region = await openYourContributions();
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
    const region = await openYourContributions();
    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    const buy = within(within(region).getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' });

    await user.click(buy);
    await user.click(buy);

    for (const button of within(region).getAllByRole('button')) expect(button).toBeDisabled();
    expect(requests).toBe(1);

    // Let the one request finish inside the test, so nothing settles after teardown.
    respond();
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
  });

  it('shows "× 2" for a hold of 2 units', async () => {
    listViews(list([{ ...active, units: 2, purchasableUnits: 2 }, { ...active, holdId: 'hold-2' }]));
    const region = await openYourContributions();

    expect(within(region).getAllByText(/^× /).map((count) => count.textContent)).toEqual(['× 2']);
  });

  it('shows "× 2" for 2 units bought, and none for 1 bought', async () => {
    listViews(list([{ ...purchased, units: 3, purchasedUnits: 2 }, { ...purchased, holdId: 'hold-2', units: 2, purchasedUnits: 1 }]));
    const region = await openYourContributions();

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
    const region = await openYourContributions();
    const buy = within(region).getByRole('button', { name: 'Mark as purchased' });

    await user.click(buy);

    expect(within(region).getByRole('dialog')).toBeInTheDocument();
    expect(requests).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(region).queryByRole('dialog')).not.toBeInTheDocument();
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
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.type(screen.getByLabelText('Message to the owner (optional)'), 'Congrats');
    await user.click(within(within(region).getByRole('dialog')).getByRole('button', { name: 'Mark as purchased' }));

    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Stroller is marked as purchased. Thank you!'));
    expect(sent).toEqual({ units: 1, message: 'Congrats' });
    expect(within(region).queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the typed message when the purchase is refused as unavailable', async () => {
    const expired: HoldView = { ...expiredBuyable, units: 3, purchasableUnits: 3 };
    listViews(list([expired]), list([{ ...expired, purchasableUnits: 1 }]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'This item is no longer available.', code: 'item_unavailable' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

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
    const region = await openYourContributions({ itemTitle: 'Baby onesies' });

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'One fewer' }));
    await user.click(screen.getByRole('button', { name: 'Mark 1 as purchased' }));

    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Baby onesies: 1 marked as purchased. Thank you!'));
    expect(units).toBe(1);
    expect(within(region).queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Baby onesies' })).toHaveFocus();
  });

  it('after a refusal, keeps the purchase sheet open and caps it at the units still free', async () => {
    const expired: HoldView = { ...expiredBuyable, units: 3, purchasableUnits: 3 };
    listViews(list([expired]), list([{ ...expired, purchasableUnits: 1 }]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'This item is no longer available.', code: 'item_unavailable' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'Mark 3 as purchased' }));

    const sheet = screen.getByRole('dialog', { name: 'How many did you buy?' });
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Mark 1 as purchased' })).toBeEnabled());
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Only 1 is still free to mark as purchased.');
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes the purchase sheet on a refusal for a hold the refetch removes, and shows why beside the sheet\'s heading', async () => {
    // Released in another tab while the sheet was open, so the refetch drops it.
    listViews(list([{ ...active, units: 2, purchasableUnits: 2 }], [pledge]), list([], [pledge]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'Mark 2 as purchased' }));

    await waitFor(() => expect(within(region).getByRole('alert')).toHaveTextContent('This hold is no longer active.'));
    expect(within(region).queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Your contributions' })).toHaveFocus();
  });

  it('closes the purchase sheet when the refusal leaves nothing to buy, and shows why beside the sheet\'s heading', async () => {
    const expired: HoldView = { ...expiredBuyable, units: 3, purchasableUnits: 3 };
    const lapsed: HoldView = { ...expired, purchasableUnits: 0, actions: { extend: false, release: false, purchase: false } };
    // Another guest then releases a unit, so the hold can be bought again.
    listViews(list([expired]), list([lapsed]), list([{ ...expired, purchasableUnits: 1 }]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/purchase', 409, { message: 'Your hold expired and this gift has since been held or bought by someone else.', code: 'item_unavailable' }));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await user.click(screen.getByRole('button', { name: 'Mark 3 as purchased' }));

    await waitFor(() => expect(within(region).getByRole('alert')).toHaveTextContent('Your hold expired and this gift has since been held or bought by someone else.'));
    expect(within(region).queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Your contributions' })).toHaveFocus();

    await client.invalidateQueries({ queryKey: listViewKey('abc123') });

    const markAsPurchased = await within(region).findByRole('button', { name: 'Mark as purchased' });
    expect(within(region).queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(markAsPurchased);

    expect(within(screen.getByRole('dialog', { name: 'How many did you buy?' })).getByRole('alert')).toBeEmptyDOMElement();
  });

  it.each([
    [1, 'it is'],
    [2, 'they are'],
  ])('closes the purchase sheet and says to reload when a refetch takes away the purchase of a %i-unit hold', async (units, pronoun) => {
    const expired: HoldView = { ...expiredBuyable, units, purchasableUnits: units };
    const lapsed: HoldView = { ...expired, purchasableUnits: 0, actions: { extend: false, release: false, purchase: false } };
    // While the guest looks for their receipt, the last free unit goes to someone else.
    listViews(list([expired]), list([lapsed]));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Mark as purchased' }));
    await client.invalidateQueries({ queryKey: listViewKey('abc123') });

    await waitFor(() => expect(within(region).getByRole('alert')).toHaveTextContent(`You can no longer mark Stroller as purchased. Reload to see if ${pronoun} still available.`));
    expect(within(region).queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows no button when the guest has neither holds nor pledges', async () => {
    listViews(list([]));
    renderYourContributions();

    // The page-level live regions stay mounted, so they show the list view has landed.
    await screen.findByRole('status');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('labels the button with the number of entries', async () => {
    listViews(list([active], [pledge, { ...pledge, contributionId: 'pledge-2' }]));
    renderYourContributions();

    expect(await screen.findByRole('button', { name: 'Your contributions · 3' })).toBeInTheDocument();
  });

  it.each([
    [99, '99'],
    [100, '99+'],
  ])('shows %i entries on the button as %s', async (count, label) => {
    const pledges = Array.from({ length: count }, (_, i) => ({ ...pledge, contributionId: `pledge-${i}` }));
    listViews(list([], pledges));
    renderYourContributions();

    expect(await screen.findByRole('button', { name: `Your contributions · ${label}` })).toBeInTheDocument();
  });

  it('lists holds, then pledges in the order the server sends them', async () => {
    const older: Pledge = { ...pledge, contributionId: 'pledge-0', amountMinor: 1500, pledgedAt: '2026-01-01T00:00:00.000Z' };
    listViews(list([active], [pledge, older]));
    const region = await openYourContributions();

    const entries = within(region).getAllByRole('listitem');
    expect(entries.map((entry) => within(entry).getByRole('heading').textContent)).toEqual(['Stroller', 'Pram fund', 'Pram fund']);
    expect(within(entries[1]).getByText('You chipped in $40.00.')).toBeInTheDocument();
    expect(within(entries[2]).getByText('You chipped in $15.00.')).toBeInTheDocument();
  });

  it('returns focus to the button when the sheet closes', async () => {
    listViews(list([active]));
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: 'Close' }));

    expect(region).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your contributions · 1' })).toHaveFocus();
  });

  it('when the last hold is released, closes the sheet, announces it and calls onEmptied', async () => {
    listViews(list([active]), list([]));
    server.use(mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } }));
    const onEmptied = vi.fn();
    const user = userEvent.setup();
    const region = await openYourContributions({ onEmptied });

    await user.click(within(region).getByRole('button', { name: 'Release hold' }));
    await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(region).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Your hold on Stroller is released.');
    expect(screen.queryByRole('button', { name: /^Your contributions/ })).not.toBeInTheDocument();
    expect(onEmptied).toHaveBeenCalledTimes(1);
  });

  it('does not stamp the button shown on load', async () => {
    listViews(list([active]));
    renderYourContributions();

    const button = await screen.findByRole('button', { name: 'Your contributions · 1' });
    expect(button.querySelector('[data-seal]')!.className).not.toContain('animate-stamp');
  });

  it('stamps the button the first time it appears', async () => {
    listViews(list([]), list([active]));
    renderYourContributions();
    await screen.findByRole('status');

    await client.invalidateQueries();

    const button = await screen.findByRole('button', { name: 'Your contributions · 1' });
    expect(button.querySelector('[data-seal]')!.className.split(' ')).toContain('motion-safe:animate-stamp');
  });

  it('keeps the same seal when a later entry arrives', async () => {
    listViews(list([active]), list([active, { ...active, holdId: 'hold-2' }]));
    renderYourContributions();
    const seal = (await screen.findByRole('button', { name: 'Your contributions · 1' })).querySelector('[data-seal]');

    await client.invalidateQueries();

    // The seal plays its animation once, as it mounts.
    expect((await screen.findByRole('button', { name: 'Your contributions · 2' })).querySelector('[data-seal]')).toBe(seal);
  });

  it('does not stamp the button when it reappears after the sheet emptied', async () => {
    listViews(list([]), list([active]), list([]), list([active]));
    renderYourContributions();
    await screen.findByRole('status');
    await client.invalidateQueries();
    await screen.findByRole('button', { name: 'Your contributions · 1' });
    await client.invalidateQueries();
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());

    await client.invalidateQueries();

    const button = await screen.findByRole('button', { name: 'Your contributions · 1' });
    expect(button.querySelector('[data-seal]')!.className).not.toContain('animate-stamp');
  });

  it.each([
    ['release', 'Release hold', 'status', () => mock('post', '/api/lists/{slug}/holds/{holdId}/release', 200, { ...active, status: 'released', actions: { extend: false, release: false, purchase: false } })],
    ['refusal', 'Extend hold', 'alert', () => mock('post', '/api/lists/{slug}/holds/{holdId}/extend', 409, { message: 'This hold is no longer active.', code: 'hold_not_active' })],
  ] as const)('holds back a %s until its refetch lands, so one that empties the sheet is announced once', async (_, press, role, answer) => {
    let landRefetch!: () => void;
    const refetched = new Promise<void>((resolve) => { landRefetch = resolve; });
    let gets = 0;
    server.use(
      http.get('/api/lists/abc123', async () => {
        if (++gets === 1) return HttpResponse.json(list([active]));
        await refetched;
        return HttpResponse.json(list([]));
      }),
      answer(),
    );
    const user = userEvent.setup();
    const region = await openYourContributions();

    await user.click(within(region).getByRole('button', { name: press }));
    if (press === 'Release hold') await user.click(within(region).getByRole('button', { name: 'Yes, release it' }));
    await waitFor(() => expect(gets).toBe(2));

    expect(within(region).getByRole(role)).toBeEmptyDOMElement();
    landRefetch();
    await waitFor(() => expect(region).not.toBeInTheDocument());
  });
});
