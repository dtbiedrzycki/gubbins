import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
