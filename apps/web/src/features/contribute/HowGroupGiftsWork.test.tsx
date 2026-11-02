import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HowGroupGiftsWork } from './HowGroupGiftsWork';

const card = () => screen.queryByRole('region', { name: 'How group gifts work' });

describe('HowGroupGiftsWork', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('says guests pay the host and the host buys the gift', () => {
    render(<HowGroupGiftsWork />);
    expect(screen.getByText('Chip in any amount.')).toBeInTheDocument();
    expect(screen.getByText('Send it straight to the host.')).toBeInTheDocument();
    expect(screen.getByText('The host buys the gift.')).toBeInTheDocument();
    expect(card()).toHaveTextContent('When you chip in, we’ll show you how to pay the host with Venmo or Zelle.');
  });

  it('shows on every visit until the guest dismisses it, then stays hidden', async () => {
    const first = render(<HowGroupGiftsWork />);
    expect(card()).toBeInTheDocument();
    first.unmount();
    const second = render(<HowGroupGiftsWork />);
    expect(card()).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(card()).not.toBeInTheDocument();
    second.unmount();

    render(<HowGroupGiftsWork />);
    expect(card()).not.toBeInTheDocument();
  });

  it("leaves the holding explainer's dismissal alone", async () => {
    render(<HowGroupGiftsWork />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(localStorage.getItem('gubbins.holdingExplainerDismissed')).toBeNull();
  });

  it('dismisses for this visit only where storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const first = render(<HowGroupGiftsWork />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(card()).not.toBeInTheDocument();
    first.unmount();

    render(<HowGroupGiftsWork />);
    expect(card()).toBeInTheDocument();
  });
});
