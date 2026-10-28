import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { server } from '../test/msw/server';
import ListPage from './ListPage';

const hold: HoldView = {
  holdId: 'hold-1', itemId: 'item-1', status: 'active', expiresAt: '2026-01-04T00:00:00.000Z',
  extendedAt: null, actions: { extend: true, release: true, purchase: true },
};
const view = (held: boolean): ListViewResponse => ({
  title: 'Baby Shower',
  items: [{ id: 'item-1', title: 'Stroller', type: 'single', status: held ? 'held' : 'available', availableUnits: held ? 0 : 1, url: null, priceMinor: null, pledgedMinor: null }],
  payment: { venmoHandle: null, zelleHandle: null },
  myHolds: held ? [hold] : [],
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
      { id: 'item-2', title: 'Cot', type: 'single', status: 'available', availableUnits: 1, url: null, priceMinor: null, pledgedMinor: null },
    ],
    myHolds: [{ ...hold, itemId: 'item-2' }],
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

  it('keeps a gift held from the Available filter on screen and moves focus to "Your holds"', async () => {
    let held = false;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/items/item-1/hold', () => { held = true; return HttpResponse.json(hold, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: 'Available · 1' }));
    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByText('Stroller is held.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your holds' })).toHaveFocus();
  });

  it('says so when no gifts match the chosen filter', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(false))));
    renderListPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Held · 0' }));

    expect(screen.getByText('No gifts here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Stroller' })).not.toBeInTheDocument();
  });

  it('explains holding: hold before buying, buy within 3 days, then mark it purchased or the hold ends', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(false))));
    renderListPage();

    const box = (await screen.findByText('How holding a gift works')).closest('details')!;
    expect(within(box).getByText('Hold it before you buy it.')).toBeInTheDocument();
    expect(within(box).getByText('Buy it within 3 days.')).toBeInTheDocument();
    expect(within(box).getByText('Come back and mark it purchased.')).toBeInTheDocument();
    expect(box).toHaveTextContent('If you don\u2019t, the hold ends after 3 days and another guest can buy the same gift.');
  });

  it.each([
    ['only group gifts', { ...view(false), items: [{ id: 'item-1', title: 'Honeymoon fund', type: 'group', status: 'available', availableUnits: 0, url: null, priceMinor: 50000, pledgedMinor: 0 }] }],
    ['no single gift left to hold', view(true)],
  ] satisfies [string, ListViewResponse][])('leaves out the holding explainer when the list has %s', async (_, list) => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(list)));
    renderListPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Baby Shower' })).toBeInTheDocument();
    expect(screen.queryByText('How holding a gift works')).not.toBeInTheDocument();
  });

  it('opens the holding explainer on the first visit that has a gift to hold, even after a visit with none', async () => {
    localStorage.clear();
    const fundsOnly: ListViewResponse = { ...view(false), items: [{ id: 'item-1', title: 'Honeymoon fund', type: 'group', status: 'available', availableUnits: 0, url: null, priceMinor: 50000, pledgedMinor: 0 }] };
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(fundsOnly)));
    const firstVisit = renderListPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Baby Shower' })).toBeInTheDocument();
    firstVisit.unmount();

    server.use(http.get('/api/lists/abc123', () => HttpResponse.json(view(false))));
    renderListPage();
    expect((await screen.findByText('How holding a gift works')).closest('details')).toHaveAttribute('open');
    localStorage.clear();
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
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    const yourHolds = screen.getByRole('region', { name: 'Your holds' });
    expect(await within(yourHolds).findByRole('button', { name: 'Extend hold' })).toBeInTheDocument();
    expect(screen.getByText('Stroller is held.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
    // The Hold button is gone; focus goes where the new hold's actions are.
    expect(within(yourHolds).getByRole('heading', { name: 'Your holds' })).toHaveFocus();
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
    await user.type(screen.getByLabelText('Your name'), 'Amara');
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
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(await screen.findByLabelText('Guest key')).toBeInTheDocument();
  });

  it('moves focus to Your holds when the guest cancels after losing the item to someone else', async () => {
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
    await user.type(screen.getByLabelText('Your name'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await waitFor(() => expect(screen.getByText('Stroller is held.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { name: 'Your holds' })).toHaveFocus();
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
