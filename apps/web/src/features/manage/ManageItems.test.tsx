import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw/server';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { api } from '../../api/client';
import { ManageItems } from './ManageItems';
import { manageViewKey } from './manageViewKey';

const item = (over: Partial<ManageViewResponse['items'][number]>): ManageViewResponse['items'][number] => ({
  id: 'i1', type: 'single', title: 'Rings', quantity: 1, priceMinor: 2400, url: null, description: null,
  deletable: true, committedUnits: 0, pledgedMinor: null, ...over,
});

function renderItems(items: ManageViewResponse['items']) {
  const client = new QueryClient();
  const view = (shown: ManageViewResponse['items']) => (
    <QueryClientProvider client={client}>
      <ManageItems slug="abc123" onUnauthorized={() => {}} items={shown} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(items));
  return { rerender: (shown: ManageViewResponse['items']) => rerender(view(shown)) };
}

type Items = ManageViewResponse['items'];
const view = (items: Items): ManageViewResponse => ({ title: 'Baby Shower', description: null, key: 'k', items });
const abc = () => [item({ id: 'a', title: 'A' }), item({ id: 'b', title: 'B' }), item({ id: 'c', title: 'C' })];

/** Renders the items from a live manage-view query, as the page does: the list refetches after each move. */
function renderLiveItems(initial: Items) {
  let current = initial;
  const moves: Array<{ itemId: string; to: string }> = [];
  server.use(
    http.get('/api/lists/:slug/manage', () => HttpResponse.json(view(current))),
    http.post('/api/lists/:slug/items/:itemId/move', async ({ params, request }) => {
      const { to } = (await request.json()) as { to: string };
      const itemId = params.itemId as string;
      moves.push({ itemId, to });
      const from = current.findIndex((i) => i.id === itemId);
      const rest = current.filter((i) => i.id !== itemId);
      const at = { top: 0, up: Math.max(from - 1, 0), down: Math.min(from + 1, rest.length), bottom: rest.length }[to]!;
      current = [...rest.slice(0, at), current[from]!, ...rest.slice(at)];
      return HttpResponse.json({ ok: true });
    }),
  );
  const onUnauthorized = vi.fn();
  function Live() {
    const { data } = useQuery({ queryKey: manageViewKey('abc123'), queryFn: () => api.getManageView('abc123') });
    return data ? <ManageItems slug="abc123" items={data.items} onUnauthorized={onUnauthorized} /> : null;
  }
  render(<QueryClientProvider client={new QueryClient()}><Live /></QueryClientProvider>);
  return { moves, onUnauthorized };
}

const titles = () => screen.getAllByRole('listitem').map((li) => li.querySelector('p')!.textContent);
const announcement = () => document.getElementById('move-announcement')!;
/** The next move fails with this message; later moves succeed. */
const nextMoveFails = (message: string) =>
  http.post('/api/lists/:slug/items/:itemId/move', () => HttpResponse.json({ message }, { status: 500 }), { once: true });

describe('ManageItems', () => {
  it("shows each item's price and quantity, and a group gift's target", () => {
    renderItems([
      item({}),
      item({ id: 'i2', title: 'Swaddles', quantity: 2, priceMinor: 3200 }),
      item({ id: 'i3', type: 'group', title: 'Stroller fund', priceMinor: 40000, pledgedMinor: 0 }),
    ]);

    expect(screen.getByText('$24.00 · quantity 1')).toBeInTheDocument();
    expect(screen.getByText('$32.00 · quantity 2')).toBeInTheDocument();
    expect(screen.getByText('$400.00 target')).toBeInTheDocument();
  });

  it('leaves the price out for a single item without one', () => {
    renderItems([item({ quantity: 3, priceMinor: null })]);

    expect(screen.getByText('quantity 3')).toBeInTheDocument();
  });

  it('Edit opens the form for that item', async () => {
    const user = userEvent.setup();
    renderItems([item({}), item({ id: 'i2', title: 'Swaddles' })]);

    await user.click(screen.getByRole('button', { name: 'Edit Swaddles' }));

    expect(screen.getByLabelText('Title')).toHaveValue('Swaddles');
    expect(screen.getByRole('button', { name: 'Edit Rings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('deletes an untouched item after confirming, and Keep it backs out', async () => {
    const deleted: string[] = [];
    server.use(http.delete('/api/lists/:slug/items/:itemId', ({ params }) => {
      deleted.push(params.itemId as string);
      return HttpResponse.json({ ok: true });
    }));
    const user = userEvent.setup();
    renderItems([item({})]);

    await user.click(screen.getByRole('button', { name: 'Delete Rings' }));
    expect(screen.getByRole('group', { name: 'Delete \u201cRings\u201d? This can\u2019t be undone.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('button', { name: 'Keep it' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Rings' })).toHaveFocus();
    expect(deleted).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Delete Rings' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toEqual(['i1']));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Items' })).toHaveFocus());
  });

  it('disables Delete with the reason once a guest has acted on the item', () => {
    renderItems([item({ deletable: false })]);

    const button = screen.getByRole('button', { name: 'Delete Rings' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Guests have already picked this one, so it can\u2019t be deleted.');
  });

  it("shows the server's reason once, with focus on it, when a guest got there first", async () => {
    const reason = "Guests have already picked this one, so it can't be deleted.";
    server.use(http.delete('/api/lists/:slug/items/:itemId', () => HttpResponse.json({ message: reason, code: 'item_has_guest_history' }, { status: 409 })));
    const user = userEvent.setup();
    const { rerender } = renderItems([item({})]);

    await user.click(screen.getByRole('button', { name: 'Delete Rings' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(reason));
    expect(screen.getByRole('alert')).toHaveFocus();
    // The refreshed list now marks the item undeletable; the reason still shows only once.
    rerender([item({ deletable: false })]);
    expect(screen.getAllByText(/can.t be deleted/)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete Rings' })).toHaveAccessibleDescription(reason);
  });

  it('moves focus to the first enabled button when the tapped one is disabled at the end', async () => {
    const user = userEvent.setup();
    renderLiveItems(abc());

    await user.click(await screen.findByRole('button', { name: 'Move C to the top' }));

    await waitFor(() => expect(titles()).toEqual(['C', 'A', 'B']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move C down' })).toHaveFocus());
  });

  it('keeps focus on Up after moving up one place', async () => {
    const user = userEvent.setup();
    renderLiveItems(abc());

    await user.click(await screen.findByRole('button', { name: 'Move C up' }));

    await waitFor(() => expect(announcement()).toHaveTextContent('C moved to position 2 of 3.'));
    expect(titles()).toEqual(['A', 'C', 'B']);
    expect(screen.getByRole('button', { name: 'Move C up' })).toHaveFocus();
  });

  it.each([
    ['up', 'up'], ['to the top', 'top'], ['down', 'down'], ['to the bottom', 'bottom'],
  ])('the %s button asks for %s', async (name, to) => {
    const user = userEvent.setup();
    const { moves } = renderLiveItems(abc());

    await user.click(await screen.findByRole('button', { name: `Move B ${name}` }));

    await waitFor(() => expect(moves).toEqual([{ itemId: 'b', to }]));
  });

  it('disables Up and Top on the first gift and Down and Bottom on the last; a lone gift has all four disabled', () => {
    const { rerender } = renderItems(abc());
    const disabled = (title: string) => within(screen.getByRole('group', { name: `Move ${title}` }))
      .getAllByRole('button').map((b) => [b.getAttribute('aria-label'), (b as HTMLButtonElement).disabled]);

    expect(disabled('A')).toEqual([['Move A up', true], ['Move A to the top', true], ['Move A down', false], ['Move A to the bottom', false]]);
    expect(disabled('B')).toEqual([['Move B up', false], ['Move B to the top', false], ['Move B down', false], ['Move B to the bottom', false]]);
    expect(disabled('C')).toEqual([['Move C up', false], ['Move C to the top', false], ['Move C down', true], ['Move C to the bottom', true]]);

    rerender([item({ id: 'a', title: 'A' })]);
    expect(disabled('A').map(([, off]) => off)).toEqual([true, true, true, true]);
  });

  it('ignores a tap while a move is pending', async () => {
    const user = userEvent.setup();
    renderLiveItems(abc());
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let sent = 0;
    server.use(http.post('/api/lists/:slug/items/:itemId/move', async () => {
      sent += 1;
      await held;
      return HttpResponse.json({ ok: true });
    }));
    const up = await screen.findByRole('button', { name: 'Move C up' });

    await user.click(up);
    await waitFor(() => expect(up).toHaveAttribute('aria-disabled', 'true'));
    await user.click(up);
    release();

    await waitFor(() => expect(up).not.toHaveAttribute('aria-disabled'));
    expect(sent).toBe(1);
  });

  it("shows the server's error in the gift's row, with focus on it, and announces nothing", async () => {
    const user = userEvent.setup();
    renderLiveItems(abc());
    server.use(nextMoveFails('The list could not be saved.'));

    await user.click(await screen.findByRole('button', { name: 'Move C up' }));

    const alert = await screen.findByText('The list could not be saved.');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert.closest('li')).toBe(screen.getByRole('group', { name: 'Move C' }).closest('li'));
    await waitFor(() => expect(alert).toHaveFocus());
    expect(announcement()).toBeEmptyDOMElement();
  });

  it("keeps a gift's error while another gift moves, and clears it when that gift moves again", async () => {
    const user = userEvent.setup();
    renderLiveItems(abc());
    server.use(nextMoveFails('The list could not be saved.'));

    await user.click(await screen.findByRole('button', { name: 'Move A down' }));
    await screen.findByText('The list could not be saved.');

    await user.click(screen.getByRole('button', { name: 'Move B down' }));
    await waitFor(() => expect(titles()).toEqual(['A', 'C', 'B']));
    expect(screen.getByText('The list could not be saved.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Move A down' }));
    await waitFor(() => expect(titles()).toEqual(['C', 'A', 'B']));
    expect(screen.queryByText('The list could not be saved.')).not.toBeInTheDocument();
  });

  it('sends the owner back to the token gate on 404', async () => {
    const user = userEvent.setup();
    const { onUnauthorized } = renderLiveItems(abc());
    server.use(http.post('/api/lists/:slug/items/:itemId/move', () => HttpResponse.json({ message: 'Not found' }, { status: 404 })));

    await user.click(await screen.findByRole('button', { name: 'Move C up' }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});
