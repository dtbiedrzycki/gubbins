import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GiftDetailsResponse } from '@gubbins/shared-types';
import { GiftDetailsCard } from './GiftDetailsCard';

const details = (over: Partial<GiftDetailsResponse['items'][number]>): GiftDetailsResponse['items'][number] =>
  ({ itemId: 'i1', purchases: [], holds: [], pledges: [], ...over });

describe('GiftDetailsCard', () => {
  // Dates in the current year show without one, so "now" is pinned.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T12:00:00.000Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('lists who bought a gift, on what day, with their message', () => {
    render(<GiftDetailsCard details={details({
      purchases: [{ name: 'Maya Chen', units: 1, message: 'Happy 30th!', purchasedAt: '2026-11-12T12:00:00.000Z' }],
    })} />);
    expect(screen.getByText('Bought')).toBeInTheDocument();
    expect(screen.getByText('Maya Chen')).toBeInTheDocument();
    expect(screen.getByText('Nov 12')).toBeInTheDocument();
    expect(screen.getByText('Happy 30th!')).toBeInTheDocument();
  });

  it('lists who holds a gift and until when, with the units when there are 2', () => {
    render(<GiftDetailsCard details={details({ holds: [{ name: 'Jo', units: 2, expiresAt: '2026-11-27T12:00:00.000Z' }] })} />);
    expect(screen.getByText('Held')).toBeInTheDocument();
    expect(screen.getByText('Jo · 2')).toBeInTheDocument();
    expect(screen.getByText('until Nov 27')).toBeInTheDocument();
  });

  it('lists who pledged to a group gift, with the amount', () => {
    render(<GiftDetailsCard details={details({ pledges: [{ name: 'Priya Nair', amountMinor: 6000, message: null, pledgedAt: '2026-11-03T12:00:00.000Z' }] })} />);
    expect(screen.getByText('Pledged')).toBeInTheDocument();
    expect(screen.getByText('Priya Nair · $60.00')).toBeInTheDocument();
  });

  it('says no one has acted yet when every list is empty', () => {
    render(<GiftDetailsCard details={details({})} />);
    expect(screen.getByText('No one has held, bought or pledged yet.')).toBeInTheDocument();
  });

  it('shows a message as plain text, not markup', () => {
    const { container } = render(<GiftDetailsCard details={details({
      purchases: [{ name: 'Sam', units: 1, message: '<b>hi</b> *there*', purchasedAt: '2026-11-12T12:00:00.000Z' }],
    })} />);
    expect(screen.getByText('<b>hi</b> *there*')).toBeInTheDocument();
    expect(container.querySelector('b, em')).toBeNull();
  });
});
