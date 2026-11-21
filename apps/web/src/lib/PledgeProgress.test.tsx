import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PledgeProgress } from './PledgeProgress';

describe('PledgeProgress', () => {
  it('fills the bar to 100%, not 150%, when $15.00 is pledged toward $10.00', () => {
    render(<PledgeProgress priceMinor={1000} pledgedMinor={1500} />);
    expect(document.querySelector<HTMLElement>('[data-bar-fill]')!.style.width).toBe('100%');
  });

  it('hides the coin bar from screen readers, since the pledged text says the same', () => {
    render(<PledgeProgress priceMinor={1000} pledgedMinor={500} />);
    expect(document.querySelector('[data-bar-fill]')!.parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides the progress bar visually but keeps it for screen readers', () => {
    render(<PledgeProgress priceMinor={1000} pledgedMinor={500} />);
    expect(screen.getByRole('progressbar')).toHaveClass('sr-only');
  });

  it.each([
    [16250, 16250, '$162.50 of $450.00 pledged · 36%'],
    [13050, 13050, '$130.50 of $450.00 pledged · 29%'],
    [52000, 45000, '$520.00 of $450.00 pledged · 115%'],
  ])('shows %i pledged toward $450.00 as progress', (pledgedMinor, value, label) => {
    render(<PledgeProgress priceMinor={45000} pledgedMinor={pledgedMinor} />);
    const progress = screen.getByRole('progressbar', { name: label });
    expect(progress).toHaveAttribute('max', '45000');
    expect(progress).toHaveAttribute('value', String(value));
  });

  it('shows 99%, not 100%, when 99.5% is pledged', () => {
    render(<PledgeProgress priceMinor={100000} pledgedMinor={99500} />);
    expect(screen.getByRole('progressbar', { name: '$995.00 of $1,000.00 pledged · 99%' })).toBeInTheDocument();
  });
});
