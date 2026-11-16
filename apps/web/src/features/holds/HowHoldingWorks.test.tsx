import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HowHoldingWorks } from './HowHoldingWorks';

const card = () => screen.queryByRole('region', { name: 'How claiming a gift works' });

describe('HowHoldingWorks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows on every visit until the guest dismisses it, then stays hidden', async () => {
    const first = render(<HowHoldingWorks holdDurationDays={3} />);
    expect(card()).toBeInTheDocument();
    first.unmount();
    const second = render(<HowHoldingWorks holdDurationDays={3} />);
    expect(card()).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(card()).not.toBeInTheDocument();
    second.unmount();

    render(<HowHoldingWorks holdDurationDays={3} />);
    expect(card()).not.toBeInTheDocument();
  });

  it('dismisses for this visit only where storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const first = render(<HowHoldingWorks holdDurationDays={3} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(card()).not.toBeInTheDocument();
    first.unmount();

    render(<HowHoldingWorks holdDurationDays={3} />);
    expect(card()).toBeInTheDocument();
  });

  it('says "1 day", not "1 days"', () => {
    render(<HowHoldingWorks holdDurationDays={1} />);
    expect(screen.getByText(/It\u2019s yours for 1 day,/)).toBeInTheDocument();
  });

  it('lists buying first, holding for 3 days second, and marking a held gift purchased third', () => {
    render(<HowHoldingWorks holdDurationDays={3} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Sure you’ll buy it? Tap “I’m buying this” before you buy it. Other guests see it’s taken straight away, so nobody buys it in the meantime, and there’s nothing to come back for.',
      'Not sure yet? Hold it. It’s yours for 3 days, and you can extend it once.',
      'Bought a gift you held? Come back and mark it purchased. If you don’t, the hold ends and another guest could buy the same gift.',
    ]);
  });
});
