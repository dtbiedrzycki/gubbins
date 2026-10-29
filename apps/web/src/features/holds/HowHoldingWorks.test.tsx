import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HowHoldingWorks } from './HowHoldingWorks';

const card = () => screen.queryByRole('region', { name: 'How holding a gift works' });

describe('HowHoldingWorks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows on every visit until the guest dismisses it, then stays hidden', async () => {
    const first = render(<HowHoldingWorks holdDurationDays={3} />);
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
});
