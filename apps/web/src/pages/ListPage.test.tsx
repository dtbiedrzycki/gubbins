import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ListViewResponse } from '@gubbins/shared-types';
import { server } from '../test/msw/server';
import ListPage from './ListPage';
import { aListItem } from '../test/listItem';
import { aHoldView } from '../test/holdView';

const hold = aHoldView();
const view = (held: boolean): ListViewResponse => ({
  title: 'Baby Shower', description: null,
  items: [aListItem({ status: held ? 'held' : 'available', availableUnits: held ? 0 : 1 })],
  payment: { venmoHandle: null, zelleHandle: null },
  myHolds: held ? [hold] : [],
  myContributions: [],
  capabilities: { holdDurationDays: 3 },
});

function renderListPage() {
  // useListView's own retry wins over these defaults; retryDelay: 0 keeps its one retry instant.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/abc123']}>
        <Routes><Route path="/:slug" element={<ListPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ListPage', () => {
  const twoItems: ListViewResponse = {
    ...view(false),
    items: [
      ...view(false).items!,
      aListItem({ id: 'item-2', title: 'Cot' }),
    ],
    myHolds: [{ ...hold, itemId: 'item-2' }],
    myContributions: [],
  };

  it('shows the list title and a heading for each item', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(twoItems)));
    renderListPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Baby Shower' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Stroller' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cot' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Hold this item/ })).toHaveLength(2);
    // The hold is on the second item, so its title comes from the hold's itemId.
    expect(within(screen.getByRole('region', { name: 'Your holds' })).getByRole('heading', { name: 'Cot' })).toBeInTheDocument();
  });

  it("shows the list's description in full, above the gifts", async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ ...view(false), description: 'Shipping: **12 Elm Street**' })));
    renderListPage();

    const about = await screen.findByRole('region', { name: 'About this list' });
    expect(within(about).getByText('12 Elm Street').tagName).toBe('STRONG');
    expect(document.getElementById('list-description')).not.toHaveClass('line-clamp-2');
    expect(about.compareDocumentPosition(screen.getByRole('heading', { level: 2, name: 'Stroller' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no description section when the list has none', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(false))));
    renderListPage();

    await screen.findByRole('heading', { level: 1, name: 'Baby Shower' });
    expect(screen.queryByRole('region', { name: 'About this list' })).not.toBeInTheDocument();
  });

  it('shows only held gifts when Held is chosen', async () => {
    const [stroller] = view(false).items!;
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({
      ...twoItems,
      items: [stroller, { ...twoItems.items![1], status: 'held', availableUnits: 0 }],
    })));
    renderListPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Held · 1' }));

    expect(screen.queryByRole('heading', { level: 2, name: 'Stroller' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cot' })).toBeInTheDocument();
  });

  it('after holding from the Available filter, keeps the gift on screen and moves focus to its heading', async () => {
    let held = false;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/items/item-1/hold', () => { held = true; return HttpResponse.json(hold, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: 'Available · 1' }));
    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByText('Stroller is held.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Stroller' })).toHaveFocus();
  });

  it('counts only active holds: 2 active and 1 expired read "You\'re holding 2"', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({
      ...view(true),
      myHolds: [
        { ...hold, holdId: 'h1', units: 1 },
        { ...hold, holdId: 'h2', units: 1 },
        { ...hold, holdId: 'h3', units: 1, status: 'expired' },
      ],
    })));
    renderListPage();

    expect(await screen.findByText("You're holding 2")).toBeInTheDocument();
  });

  it('sums two pledges of $40.00 and $15.00 to "You chipped in $55.00"', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({
      ...view(false),
      items: [aListItem({ type: 'group', priceMinor: 45000, pledgedMinor: 5500, availableUnits: 0 })],
      myContributions: [
        { contributionId: 'c1', itemId: 'item-1', amountMinor: 4000, pledgedAt: '2026-01-01T00:00:00.000Z' },
        { contributionId: 'c2', itemId: 'item-1', amountMinor: 1500, pledgedAt: '2026-01-02T00:00:00.000Z' },
      ],
    })));
    renderListPage();

    expect(await screen.findByText('You chipped in $55.00')).toBeInTheDocument();
  });

  it('says so when no gifts match the chosen filter', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(false))));
    renderListPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Held · 0' }));

    expect(screen.getByText('No gifts here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Stroller' })).not.toBeInTheDocument();
  });

  it('says every gift is held, purchased or funded when Available is chosen and none are left', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(true))));
    renderListPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Available · 0' }));

    expect(screen.getByText('Every gift is already held, purchased or funded.')).toBeInTheDocument();
  });

  it('explains holding: hold before buying, buy within 3 days, then mark it purchased or the hold ends', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(false))));
    renderListPage();

    const box = await screen.findByRole('region', { name: 'How holding a gift works' });
    expect(within(box).getByText('Hold it before you buy it.')).toBeInTheDocument();
    expect(within(box).getByText('Buy it within 3 days.')).toBeInTheDocument();
    expect(within(box).getByText('Come back and mark it purchased.')).toBeInTheDocument();
    expect(box).toHaveTextContent('If you don\u2019t, the hold ends after 3 days and another guest can buy the same gift.');
  });

  it.each([
    ['only group gifts', { ...view(false), items: [aListItem({ title: 'Honeymoon fund', type: 'group', availableUnits: 0, priceMinor: 50000, pledgedMinor: 0 })] }],
    ['no single gift left to hold', view(true)],
  ] satisfies [string, ListViewResponse][])('leaves out the holding explainer when the list has %s', async (_, list) => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(list)));
    renderListPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Baby Shower' })).toBeInTheDocument();
    expect(screen.queryByText('How holding a gift works')).not.toBeInTheDocument();
  });

  it('moves focus to the gift filter when the guest dismisses the holding explainer', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(false))));
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('button', { name: 'All · 1' })).toHaveFocus();
  });

  const groupGift = aListItem({ id: 'item-g', title: 'Honeymoon fund', type: 'group', availableUnits: 0, priceMinor: 50000, pledgedMinor: 0 });
  const holdingBox = () => screen.getByRole('region', { name: 'How holding a gift works' });
  const groupBox = () => screen.getByRole('region', { name: 'How group gifts work' });

  it('explains group gifts when the list has one still taking pledges', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ ...view(false), items: [groupGift] })));
    renderListPage();

    expect(await screen.findByRole('region', { name: 'How group gifts work' })).toBeInTheDocument();
  });

  it.each([
    ['only single gifts', view(false)],
    ['only fully funded group gifts', { ...view(false), items: [{ ...groupGift, pledgedMinor: 50000 }] }],
  ] satisfies [string, ListViewResponse][])('leaves out the group-gift explainer when the list has %s', async (_, list) => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(list)));
    renderListPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Baby Shower' })).toBeInTheDocument();
    expect(screen.queryByText('How group gifts work')).not.toBeInTheDocument();
  });

  it('shows the group-gift explainer below the holding explainer', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ ...view(false), items: [...view(false).items!, groupGift] })));
    renderListPage();

    await screen.findByRole('region', { name: 'How group gifts work' });
    expect(holdingBox().compareDocumentPosition(groupBox()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves focus to the group-gift explainer when the guest dismisses the holding explainer while both show', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ ...view(false), items: [...view(false).items!, groupGift] })));
    const user = userEvent.setup();
    renderListPage();

    await screen.findByRole('region', { name: 'How group gifts work' });
    await user.click(within(holdingBox()).getByRole('button', { name: 'Dismiss' }));

    expect(within(groupBox()).getByRole('button', { name: 'Dismiss' })).toHaveFocus();
  });

  it('moves focus to the gift filter when the guest dismisses the group-gift explainer', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ ...view(false), items: [groupGift] })));
    const user = userEvent.setup();
    renderListPage();

    await user.click(within(await screen.findByRole('region', { name: 'How group gifts work' })).getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('button', { name: 'All · 1' })).toHaveFocus();
  });

  it('says "1 day" for a one-day hold', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ ...view(false), capabilities: { holdDurationDays: 1 } })));
    renderListPage();

    expect(await screen.findByText('Buy it within 1 day.')).toBeInTheDocument();
  });

  it('holds the item, then shows it held and under "Your holds" with its actions', async () => {
    let held = false;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/items/item-1/hold', () => { held = true; return HttpResponse.json(hold, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: /^Hold this item/ }));
    expect(screen.getByText('After you buy it, come back and tap \u201cMark as purchased\u201d.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    const yourHolds = screen.getByRole('region', { name: 'Your holds' });
    expect(await within(yourHolds).findByRole('button', { name: 'Extend hold' })).toBeInTheDocument();
    expect(screen.getByText('Stroller is held.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
  });

  it('keeps the list, with the new hold under "Your holds", when the refetch after a hold fails', async () => {
    let gets = 0;
    server.use(
      http.get('/api/lists/abc123', () => (++gets === 1 ? HttpResponse.json(view(false)) : HttpResponse.json({ message: 'Unavailable' }, { status: 503 }))),
      http.post('/api/lists/abc123/items/item-1/hold', () => HttpResponse.json(hold, { status: 201 })),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: /^Hold this item/ }));
    // Screen readers miss a live region that arrives already holding its text.
    const statuses = screen.getAllByRole('status');
    for (const status of statuses) expect(status).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    // The refetch, then its one retry.
    await waitFor(() => expect(gets).toBe(3));
    const yourHolds = screen.getByRole('region', { name: 'Your holds' });
    expect(await within(yourHolds).findByRole('button', { name: 'Extend hold' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Guest key')).not.toBeInTheDocument();
    expect(statuses).toContain(screen.getByText("Couldn't refresh the list, so it may be out of date."));
    expect(gets).toBe(3);
  });

  it('goes back to the guest key when a refetch says the session is gone', async () => {
    let gets = 0;
    server.use(
      http.get('/api/lists/abc123', () => (++gets === 1 ? HttpResponse.json(view(false)) : HttpResponse.json({ message: 'Not found' }, { status: 404 }))),
      http.post('/api/lists/abc123/items/item-1/hold', () => HttpResponse.json(hold, { status: 201 })),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByLabelText('Guest key')).toBeInTheDocument();
  });

  it("after losing the item to someone else and cancelling, moves focus to the gift's heading", async () => {
    let gets = 0;
    server.use(
      http.get('/api/lists/abc123', () => {
        const lost = view(true);
        return HttpResponse.json(++gets === 1 ? view(false) : lost);
      }),
      http.post('/api/lists/abc123/items/item-1/hold', () => HttpResponse.json({ message: 'This item is no longer available.', code: 'item_unavailable' }, { status: 409 })),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await waitFor(() => expect(screen.getByText('Stroller is held.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Stroller' })).toHaveFocus();
  });

  it.each([401, 404])('asks for the guest key when the first load answers %i', async (status) => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ message: 'Not found' }, { status })));
    renderListPage();

    expect(await screen.findByLabelText('Guest key')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it.each([
    ['cannot reach the server', () => HttpResponse.error(), "Couldn't reach the server. Check your connection and try again."],
    ['gets a 503', () => HttpResponse.json({ message: 'Service unavailable' }, { status: 503 }), 'Service unavailable'],
  ])('shows the error, not the guest key, when the first load %s', async (_, respond, message) => {
    server.use(http.get('/api/lists/abc123', respond));
    renderListPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByLabelText('Guest key')).not.toBeInTheDocument();
  });

  it('shows the list once the server answers after "Try again"', async () => {
    let gets = 0;
    server.use(http.get('/api/lists/abc123', () => (++gets <= 2 ? HttpResponse.error() : HttpResponse.json(view(false)))));
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: /^Hold this item/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('puts focus back on "Try again" when the retry fails too, but not on the first failure', async () => {
    let gets = 0;
    server.use(http.get('/api/lists/abc123', () => { gets++; return HttpResponse.json({ message: 'Service unavailable' }, { status: 503 }); }));
    const user = userEvent.setup();
    renderListPage();

    const first = await screen.findByRole('button', { name: 'Try again' });
    expect(first).not.toHaveFocus();
    await user.click(first);

    // The load and its one retry, then the same again after the click.
    await waitFor(() => expect(gets).toBe(4));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Try again' })).not.toBe(first);
  });
});
