import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ListViewResponse } from '@gubbins/shared-types';
import { server } from '../../test/msw/server';
import { mock } from '../../test/msw/mock';
import { ItemView } from './ItemView';
import { aListItem } from '../../test/listItem';
import { aHoldView } from '../../test/holdView';

const heldView = aHoldView();

const payment: ListViewResponse['payment'] = { venmoHandle: 'my-venmo', zelleHandle: null };

type Item = NonNullable<ListViewResponse['items']>[number];
const single = aListItem;

/** Renders the item; the returned function renders it again with a notice from Your contributions. */
function renderItem(over: Partial<Item> = {}, mine: { heldUnits?: number; chippedInMinor?: number } = {}): (notice: string) => void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui = (notice?: string) => (
    <QueryClientProvider client={client}>
      <ItemView slug="abc123" holdDurationDays={3} item={single(over)} payment={payment} heldUnits={mine.heldUnits ?? 0} chippedInMinor={mine.chippedInMinor ?? 0} notice={notice} />
    </QueryClientProvider>
  );
  const { rerender } = render(ui());
  return (notice) => rerender(ui(notice));
}

/** Records the body of every hold request; answers each with the next status given. */
function holdEndpoint(...statuses: number[]) {
  const bodies: { idempotencyKey: string; name?: string; units?: number }[] = [];
  server.use(http.post('/api/lists/abc123/items/item-1/hold', async ({ request }) => {
    bodies.push((await request.json()) as (typeof bodies)[number]);
    const status = statuses[bodies.length - 1] ?? 201;
    return status === 201 ? HttpResponse.json(heldView, { status }) : HttpResponse.json({ message: 'Request failed' }, { status });
  }));
  return bodies;
}

describe('ItemView', () => {
  it('opens the hold dialog from an available item, sends the details and closes once the hold succeeds', async () => {
    const bodies = holdEndpoint(201);
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    expect(screen.getByText('Other guests will see it\u2019s taken while you buy it.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
    expect(bodies).toEqual([{ idempotencyKey: expect.any(String), name: 'Amara', units: 1 }]);
  });

  it('sends the key minted at opening on every retry — not a fresh one per tap (ADR-0048)', async () => {
    const bodies = holdEndpoint(503, 201);
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].idempotencyKey).toBe(bodies[0].idempotencyKey);
  });

  it('mints a new key for a new opening, and forgets the old error', async () => {
    const bodies = holdEndpoint(503, 503);
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].idempotencyKey).not.toBe(bodies[0].idempotencyKey);
  });

  it('sends the units chosen in the hold sheet', async () => {
    const bodies = holdEndpoint(201);
    const user = userEvent.setup();
    renderItem({ availableUnits: 3 });

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold 2' }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].units).toBe(2);
  });

  it("moves focus to the gift's heading once a hold succeeds", async () => {
    holdEndpoint(201);
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    await vi.waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Stroller' })).toHaveFocus());
  });

  it("moves focus to the gift's heading when the guest cancels after the item was held by someone else", async () => {
    const client = new QueryClient();
    const view = (over: Partial<Item>) => (
      <QueryClientProvider client={client}>
        <ItemView slug="abc123" holdDurationDays={3} item={single(over)} payment={payment} heldUnits={0} chippedInMinor={0} />
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    const { rerender } = render(view({}));
    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));

    rerender(view({ status: 'held', availableUnits: 0 }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Stroller' })).toHaveFocus();
  });

  it('returns focus to the Hold button when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('button', { name: /^Hold this item/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: /^Hold this item/ })).toHaveFocus();
  });

  it.each([
    ['held', 'Stroller is held.'],
    ['purchased', 'Stroller has been purchased.'],
  ] as const)('shows a %s item as such, with no Hold or "I\u2019m buying this" button', (status, message) => {
    renderItem({ status });
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: /^Hold this item/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^I\u2019m buying this/ })).not.toBeInTheDocument();
  });

  it.each([['held', 'red-wax'], ['purchased', 'gold-wax']] as const)('marks a %s item with a %s seal that does not stamp in and is hidden from screen readers', (status, tone) => {
    renderItem({ status });
    const seal = document.querySelector('[data-seal]');
    expect(seal).toHaveAttribute('data-seal', tone);
    expect(seal).toHaveAttribute('aria-hidden', 'true');
    expect(seal!.className).not.toContain('animate-stamp');
  });

  it('shows no seal on an available item', () => {
    renderItem();
    expect(document.querySelector('[data-seal]')).toBeNull();
  });

  it('puts the button row last in its stack, so space-y adds no margin below it', () => {
    renderItem();
    const row = screen.getByRole('button', { name: /^Hold this item/ }).parentElement!;
    expect(row.parentElement?.lastElementChild).toBe(row);
  });

  it('puts "I\u2019m buying this" before "Hold this item"', () => {
    renderItem();
    const buying = screen.getByRole('button', { name: /^I\u2019m buying this/ });
    const hold = screen.getByRole('button', { name: /^Hold this item/ });
    expect(buying.compareDocumentPosition(hold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('announces the item held through the status region already on the page', () => {
    const client = new QueryClient();
    const view = (status: Item['status']) => (
      <QueryClientProvider client={client}>
        <ItemView slug="abc123" holdDurationDays={3} item={single({ status })} payment={payment} heldUnits={0} chippedInMinor={0} />
      </QueryClientProvider>
    );
    const { rerender } = render(view('available'));
    // Screen readers miss a live region that arrives already holding its text.
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    rerender(view('held'));

    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('Stroller is held.');
  });

  it('shows the title as a heading and the price formatted', () => {
    renderItem({ priceMinor: 45000 });
    expect(screen.getByRole('heading', { level: 2, name: 'Stroller' })).toBeInTheDocument();
    expect(screen.getByText('$450.00')).toBeInTheDocument();
  });

  it('shows an item\'s description under its price', () => {
    renderItem({ priceMinor: 45000, description: 'The *blue* one' });
    const price = screen.getByText('$450.00');
    const description = screen.getByText('blue');
    expect(description.tagName).toBe('EM');
    expect(price.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no description when the item has none', () => {
    renderItem({ priceMinor: 45000, description: null });
    // The status row comes straight after the price; a description of any shape would sit between.
    expect(screen.getByText('$450.00').nextElementSibling).toContainElement(screen.getByRole('status'));
  });

  it('links to the store in a new tab, naming the site and the item', () => {
    renderItem({ url: 'https://example.com/stroller' });
    const link = screen.getByRole('link', { name: 'View on example.com for Stroller (opens in a new tab)' });
    expect(link).toHaveAttribute('href', 'https://example.com/stroller');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('has no store link without a url', () => {
    renderItem();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('names the item in the "I\u2019m buying this" button', () => {
    renderItem();
    expect(screen.getByRole('button', { name: 'I\u2019m buying this: Stroller' })).toBeInTheDocument();
  });

  it('names the item in the Hold button', () => {
    renderItem();
    expect(screen.getByRole('button', { name: 'Hold this item: Stroller' })).toBeInTheDocument();
  });

  it('shows how many more are wanted only when more than one is available', () => {
    renderItem({ availableUnits: 5 });
    expect(screen.getByText('Wanted: 5 more')).toBeInTheDocument();
  });

  it.each([
    ['only one is wanted', { availableUnits: 1 }],
    ['held', { status: 'held', availableUnits: 0 }],
    ['purchased', { status: 'purchased', availableUnits: 0 }],
  ] as const)('hides how many are wanted when %s', (_, over) => {
    renderItem(over);
    expect(screen.queryByText(/^Wanted:/)).not.toBeInTheDocument();
  });

  it('announces "You\'re holding 2" through a live region already on the card', () => {
    const client = new QueryClient();
    const view = (heldUnits: number) => (
      <QueryClientProvider client={client}>
        <ItemView slug="abc123" holdDurationDays={3} item={single({ availableUnits: 5 })} payment={payment} heldUnits={heldUnits} chippedInMinor={0} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(0));
    // Screen readers miss a live region that arrives already holding its text.
    const regions = [...document.querySelectorAll('[aria-live="polite"]')];

    rerender(view(2));

    expect(regions).toContain(screen.getByText("You're holding 2"));
  });

  it('shows no holding line when the guest holds none', () => {
    renderItem({ availableUnits: 5 });
    expect(screen.queryByText(/^You're holding/)).not.toBeInTheDocument();
  });

  it('says "You chipped in $40.00" on a group gift the guest pledged to', () => {
    renderItem({ type: 'group', priceMinor: 45000, pledgedMinor: 10000, availableUnits: 0 }, { chippedInMinor: 4000 });
    expect(screen.getByText('You chipped in $40.00')).toBeInTheDocument();
  });

  it('shows no chip-in line when the guest pledged nothing', () => {
    renderItem({ type: 'group', priceMinor: 45000, pledgedMinor: 10000, availableUnits: 0 });
    expect(screen.queryByText(/^You chipped in/)).not.toBeInTheDocument();
  });

  it('still says "You chipped in $40.00" once the gift is fully funded', () => {
    renderItem({ type: 'group', priceMinor: 45000, pledgedMinor: 45000, status: 'purchased', availableUnits: 0 }, { chippedInMinor: 4000 });
    expect(screen.getByText('You chipped in $40.00')).toBeInTheDocument();
  });

  it('gives a group gift its price, and no units, Hold or "I\u2019m buying this" button', () => {
    renderItem({ type: 'group', priceMinor: 20000, availableUnits: 0 });
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Hold this item/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^I\u2019m buying this/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Wanted:/)).not.toBeInTheDocument();
  });

  it("shows a group gift's pledged progress", () => {
    renderItem({ type: 'group', priceMinor: 45000, pledgedMinor: 10000, availableUnits: 0 });
    expect(screen.getByText('$100.00 of $450.00 pledged · 22%')).toBeInTheDocument();
  });

  it('lets a guest chip in toward a group gift, thanks them, and hands focus back', async () => {
    server.use(mock('post', '/api/lists/{slug}/items/{itemId}/contributions', 201, { contributionId: 'c-1', itemId: 'item-1', amountMinor: 28750 }));
    const user = userEvent.setup();
    renderItem({ type: 'group', priceMinor: 45000, pledgedMinor: 16250, availableUnits: 0 });
    const status = screen.getByRole('status');

    await user.click(screen.getByRole('button', { name: 'Chip in' }));
    await user.click(screen.getByLabelText('Cover the rest ($287.50)'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: "I've sent it" }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
    expect(status).toHaveTextContent('Thank you! Your pledge of $287.50 is recorded.');
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Chip in' })).toHaveFocus());
  });

  describe('buying', () => {
    function buyEndpoint(status: number) {
      server.use(http.post('/api/lists/abc123/items/item-1/buy', () => status === 201
        ? HttpResponse.json(aHoldView({ status: 'purchased', units: 2, purchasedUnits: 2 }), { status })
        : HttpResponse.json({ message: 'Request failed' }, { status })));
    }

    async function openAndName(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: /^I\u2019m buying this/ }));
      await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    }

    it('announces "Stroller: 2 marked as purchased. Thank you!" after buying 2 of 5', async () => {
      buyEndpoint(201);
      const user = userEvent.setup();
      renderItem({ availableUnits: 5 });
      const status = screen.getByRole('status');

      await openAndName(user);
      await user.click(screen.getByRole('button', { name: 'One more' }));
      await user.click(screen.getByRole('button', { name: 'Yes, I\u2019m buying 2' }));

      await vi.waitFor(() => expect(status).toHaveTextContent('Stroller: 2 marked as purchased. Thank you!'));
    });

    it('empties the status when "I\u2019m buying this" is opened again after buying 1 of 5', async () => {
      server.use(http.post('/api/lists/abc123/items/item-1/buy', () => HttpResponse.json(aHoldView({ status: 'purchased', units: 1, purchasedUnits: 1 }), { status: 201 })));
      const user = userEvent.setup();
      renderItem({ availableUnits: 5 });
      const status = screen.getByRole('status');
      await openAndName(user);
      await user.click(screen.getByRole('button', { name: 'Yes, I\u2019m buying it' }));
      await vi.waitFor(() => expect(status).toHaveTextContent('Stroller is marked as purchased. Thank you!'));

      await user.click(screen.getByRole('button', { name: /^I\u2019m buying this/ }));

      expect(status).toBeEmptyDOMElement();
    });

    it('replaces the thanks with a notice from Your contributions after buying 1 of 5', async () => {
      server.use(http.post('/api/lists/abc123/items/item-1/buy', () => HttpResponse.json(aHoldView({ status: 'purchased', units: 1, purchasedUnits: 1 }), { status: 201 })));
      const user = userEvent.setup();
      const showNotice = renderItem({ availableUnits: 5 });
      const status = screen.getByRole('status');
      await openAndName(user);
      await user.click(screen.getByRole('button', { name: 'Yes, I\u2019m buying it' }));
      await vi.waitFor(() => expect(status).toHaveTextContent('Stroller is marked as purchased. Thank you!'));

      showNotice('Stroller is available to other guests again.');

      expect(status).toHaveTextContent('Stroller is available to other guests again.');
    });

    it('returns focus to "I\u2019m buying this" when the buying sheet is cancelled', async () => {
      const user = userEvent.setup();
      renderItem();

      await user.click(screen.getByRole('button', { name: /^I\u2019m buying this/ }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByRole('button', { name: /^I\u2019m buying this/ })).toHaveFocus();
    });

    it('forgets a refused purchase when the buying sheet is opened again', async () => {
      buyEndpoint(503);
      const user = userEvent.setup();
      renderItem();

      await openAndName(user);
      await user.click(screen.getByRole('button', { name: 'Yes, I\u2019m buying it' }));
      await vi.waitFor(() => expect(screen.getByRole('alert')).not.toBeEmptyDOMElement());
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await user.click(screen.getByRole('button', { name: /^I\u2019m buying this/ }));

      expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    });
  });
});
