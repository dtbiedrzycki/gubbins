import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HowHoldingWorks } from './HowHoldingWorks';

const box = () => screen.getByText('How holding a gift works').closest('details')!;

describe('HowHoldingWorks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('opens on the first visit and starts closed on the next one', () => {
    const first = render(<HowHoldingWorks holdDurationDays={3} />);
    expect(box()).toHaveAttribute('open');
    first.unmount();

    render(<HowHoldingWorks holdDurationDays={3} />);
    expect(box()).not.toHaveAttribute('open');
  });

  it('opens every visit where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<HowHoldingWorks holdDurationDays={3} />);
    expect(box()).toHaveAttribute('open');
  });
});
