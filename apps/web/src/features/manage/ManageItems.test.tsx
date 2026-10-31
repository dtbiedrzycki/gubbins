import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { ManageItems } from './ManageItems';

const item = (over: Partial<ManageViewResponse['items'][number]>): ManageViewResponse['items'][number] => ({
  id: 'i1', type: 'single', title: 'Rings', quantity: 1, priceMinor: 2400, url: null, description: null,
  deletable: true, committedUnits: 0, pledgedMinor: null, ...over,
});

describe('ManageItems', () => {
  it("shows each item's price and quantity, and a group gift's target", () => {
    render(
      <ManageItems slug="abc123" onUnauthorized={() => {}} items={[
        item({}),
        item({ id: 'i2', title: 'Swaddles', quantity: 2, priceMinor: 3200 }),
        item({ id: 'i3', type: 'group', title: 'Stroller fund', priceMinor: 40000, pledgedMinor: 0 }),
      ]} />,
    );

    expect(screen.getByText('$24.00 · quantity 1')).toBeInTheDocument();
    expect(screen.getByText('$32.00 · quantity 2')).toBeInTheDocument();
    expect(screen.getByText('$400.00 target')).toBeInTheDocument();
  });

  it('leaves the price out for a single item without one', () => {
    render(<ManageItems slug="abc123" onUnauthorized={() => {}} items={[item({ quantity: 3, priceMinor: null })]} />);

    expect(screen.getByText('quantity 3')).toBeInTheDocument();
  });

  it('Edit opens the form for that item', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ManageItems slug="abc123" onUnauthorized={() => {}} items={[item({}), item({ id: 'i2', title: 'Swaddles' })]} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit Swaddles' }));

    expect(screen.getByLabelText('Title')).toHaveValue('Swaddles');
    expect(screen.getByRole('button', { name: 'Edit Rings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });
});
