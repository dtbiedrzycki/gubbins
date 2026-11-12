import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
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

let location: Location;
function CurrentLocation() {
  const current = useLocation();
  useEffect(() => { location = current; });
  return null;
}

function renderListPage(entry = '/abc123') {
  // useListView's own retry wins over these defaults; retryDelay: 0 keeps its one retry instant.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path="/:slug" element={<ListPage />} /></Routes>
        <CurrentLocation />
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

  it('keeps a gift held from the Available filter on screen', async () => {
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
  });

  it('counts units in active holds only: 2 + 1 active and 1 expired read "You\'re holding 3"', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({
      ...view(true),
      myHolds: [
        { ...hold, holdId: 'h1', units: 2 },
        { ...hold, holdId: 'h2', units: 1 },
        { ...hold, holdId: 'h3', units: 1, status: 'expired' },
      ],
    })));
    renderListPage();

    expect(await screen.findByText("You're holding 3")).toBeInTheDocument();
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

  it('shows each gift only its own holds and pledges', async () => {
    const group = (id: string, title: string) => aListItem({ id, title, type: 'group', priceMinor: 45000, pledgedMinor: 4000, availableUnits: 0 });
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({
      ...view(false),
      items: [aListItem(), aListItem({ id: 'item-2', title: 'Cot' }), group('item-3', 'Pram'), group('item-4', 'Crib')],
      myHolds: [{ ...hold, units: 2 }],
      myContributions: [{ contributionId: 'c1', itemId: 'item-3', amountMinor: 4000, pledgedAt: '2026-01-01T00:00:00.000Z' }],
    })));
    renderListPage();

    const card = async (name: string) => within((await screen.findByRole('heading', { level: 2, name })).closest('li')!);
    expect((await card('Stroller')).getByText("You're holding 2")).toBeInTheDocument();
    expect((await card('Cot')).queryByText(/You're holding/)).not.toBeInTheDocument();
    expect((await card('Pram')).getByText('You chipped in $40.00')).toBeInTheDocument();
    expect((await card('Crib')).queryByText(/You chipped in/)).not.toBeInTheDocument();
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

  describe('a chip-in the guest left to pay', () => {
    const DRAFT_KEY = 'gubbins:contribute-draft:abc123';
    const saveDraft = () => localStorage.setItem(DRAFT_KEY, JSON.stringify({ itemId: groupGift.id, amountText: '25.00', message: 'Enjoy!', idempotencyKey: 'saved-key', savedAt: Date.now() }));
    const withGift = (items: ListViewResponse['items']): ListViewResponse => ({ ...view(false), items, payment: { venmoHandle: 'my-venmo', zelleHandle: null } });

    it('reopens a chip-in the guest left for Venmo', async () => {
      saveDraft();
      server.use(http.get('/api/lists/abc123', () => HttpResponse.json(withGift([groupGift]))));
      renderListPage();

      expect(await screen.findByLabelText('Amount (USD)')).toHaveValue('25.00');
      expect(screen.getByLabelText('Message to the owner (optional)')).toHaveValue('Enjoy!');
      expect(screen.getByRole('link', { name: 'Pay $25.00 with Venmo' })).toBeInTheDocument();
    });

    it('starts a new chip-in afresh once the reopened one is cancelled', async () => {
      saveDraft();
      server.use(http.get('/api/lists/abc123', () => HttpResponse.json(withGift([groupGift]))));
      const user = userEvent.setup();
      renderListPage();
      await screen.findByLabelText('Amount (USD)');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await user.click(screen.getByRole('button', { name: 'Chip in' }));

      expect(screen.getByLabelText('Another amount')).toHaveValue('');
    });

    it.each([
      ['deleted', []],
      ['fully funded', [{ ...groupGift, pledgedMinor: 50000 }]],
    ] satisfies [string, ListViewResponse['items']][])('drops a draft for a gift that is %s', async (_, items) => {
      saveDraft();
      server.use(http.get('/api/lists/abc123', () => HttpResponse.json(withGift(items))));
      renderListPage();

      await screen.findByRole('heading', { level: 1, name: 'Baby Shower' });
      await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
      expect(screen.queryByLabelText('Amount (USD)')).not.toBeInTheDocument();
    });
  });

  it('says "1 day" for a one-day hold', async () => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ ...view(false), capabilities: { holdDurationDays: 1 } })));
    renderListPage();

    expect(await screen.findByText('Buy it within 1 day.')).toBeInTheDocument();
  });

  it('holds the item, then lists it in Your contributions with its actions', async () => {
    let held = false;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/items/item-1/hold', () => { held = true; return HttpResponse.json(hold, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await user.click(await screen.findByRole('button', { name: 'Your contributions · 1' }));
    const yourContributions = screen.getByRole('dialog', { name: 'Your contributions' });
    expect(within(yourContributions).getByRole('heading', { name: 'Stroller' })).toBeInTheDocument();
    expect(within(yourContributions).getByRole('button', { name: 'Extend hold' })).toBeInTheDocument();
  });

  it('pads the end of the page only while the contributions button shows', async () => {
    let held = false;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/items/item-1/hold', () => { held = true; return HttpResponse.json(hold, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: /^Hold this item/ }));
    expect(screen.getByRole('main')).not.toHaveClass('pb-24');
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await screen.findByRole('button', { name: 'Your contributions · 1' });
    expect(screen.getByRole('main')).toHaveClass('pb-24');
  });

  it('when the guest releases their last hold, moves focus to the list title', async () => {
    let held = true;
    server.use(
      http.get('/api/lists/abc123', () => HttpResponse.json(view(held))),
      http.post('/api/lists/abc123/holds/hold-1/release', () => { held = false; return HttpResponse.json({ ...hold, status: 'released' }); }),
    );
    const user = userEvent.setup();
    renderListPage();

    await user.click(await screen.findByRole('button', { name: 'Your contributions · 1' }));
    await user.click(screen.getByRole('button', { name: 'Release hold' }));
    await user.click(screen.getByRole('button', { name: 'Yes, release it' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Baby Shower' })).toHaveFocus());
  });

  it('keeps the list, with the new hold in Your contributions, when the refetch after a hold fails', async () => {
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
    await user.click(await screen.findByRole('button', { name: 'Your contributions · 1' }));
    expect(within(screen.getByRole('dialog', { name: 'Your contributions' })).getByRole('button', { name: 'Extend hold' })).toBeInTheDocument();
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

  it.each([401, 404])('asks for the guest key when the first load answers %i', async (status) => {
    server.use(http.get('/api/lists/abc123', () => HttpResponse.json({ message: 'Not found' }, { status })));
    renderListPage();

    expect(await screen.findByLabelText('Guest key')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it.each([
    ['cannot reach the server', () => HttpResponse.error(), /^Couldn't load the list\. You seem to be offline\./],
    ['gets a 503', () => HttpResponse.json({ message: 'Service unavailable' }, { status: 503 }), /^Couldn't load the list\. Something went wrong on our end\./],
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

  describe('opened from the invite link', () => {
    const link = '/abc123#key=maple-lantern-otter';

    it('opens the list from the invite link without asking for the key', async () => {
      let gets = 0;
      let body: unknown;
      // Checked at each request after the first load, the moments the key screen would otherwise show.
      const keyScreenShown: boolean[] = [];
      const keyScreen = () => screen.queryByLabelText('Guest key') !== null;
      server.use(
        http.get('/api/lists/abc123', () => {
          if (++gets === 1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
          keyScreenShown.push(keyScreen());
          return HttpResponse.json(view(false));
        }),
        http.post('/api/lists/abc123/session', async ({ request }) => {
          keyScreenShown.push(keyScreen());
          body = await request.json();
          return HttpResponse.json({ ok: true });
        }),
      );
      renderListPage(link);

      expect(await screen.findByRole('heading', { level: 1, name: 'Baby Shower' })).toBeInTheDocument();
      expect(body).toEqual({ key: 'maple-lantern-otter' });
      expect(keyScreenShown).toEqual([false, false]);
      expect(location.pathname).toBe('/abc123');
      expect(location.hash).toBe('');
    });

    it("asks for the key, without sending the link's again, when the session ends after the list opened", async () => {
      let gets = 0;
      let posts = 0;
      server.use(
        http.get('/api/lists/abc123', () => (++gets === 2 ? HttpResponse.json(view(false)) : HttpResponse.json({ message: 'Not found' }, { status: 404 }))),
        http.post('/api/lists/abc123/session', () => { posts++; return HttpResponse.json({ ok: true }); }),
        http.post('/api/lists/abc123/items/item-1/hold', () => HttpResponse.json(hold, { status: 201 })),
      );
      const user = userEvent.setup();
      renderListPage(link);

      await user.click(await screen.findByRole('button', { name: /^Hold this item/ }));
      await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
      await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

      expect(await screen.findByLabelText('Guest key')).toHaveValue('');
      expect(posts).toBe(1);
    });

    it("ignores the link's key when the guest is already in", async () => {
      let posts = 0;
      server.use(
        http.get('/api/lists/abc123', () => HttpResponse.json(view(false))),
        http.post('/api/lists/abc123/session', () => { posts++; return HttpResponse.json({ ok: true }); }),
      );
      renderListPage(link);

      await screen.findByRole('heading', { level: 1, name: 'Baby Shower' });
      expect(posts).toBe(0);
    });

    it("shows the key screen with the link's key filled in when it is refused", async () => {
      server.use(
        http.get('/api/lists/abc123', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })),
        http.post('/api/lists/abc123/session', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })),
      );
      renderListPage(link);

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This list could not be found.'));
      expect(screen.getByLabelText('Guest key')).toHaveValue('maple-lantern-otter');
    });

    it("keeps the link's key for a retry when the server cannot be reached", async () => {
      server.use(
        http.get('/api/lists/abc123', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })),
        http.post('/api/lists/abc123/session', () => HttpResponse.error()),
      );
      renderListPage(link);

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t check the key. You seem to be offline. Check your connection, then try again.'));
      expect(screen.getByLabelText('Guest key')).toHaveValue('maple-lantern-otter');
    });
  });
});
