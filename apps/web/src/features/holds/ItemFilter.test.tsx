import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemFilter } from './ItemFilter';
import { aListItem } from '../../test/listItem';

const item = (over: Partial<Parameters<typeof aListItem>[0]>) => aListItem({ id: 'i', title: 'Gift', ...over });

describe('ItemFilter', () => {
  it('counts a fully pledged group gift as funded, and a partly pledged one as available', () => {
    const items = [
      item({ id: 'a', type: 'group', status: 'available', priceMinor: 1000, pledgedMinor: 1000 }),
      item({ id: 'b', type: 'group', status: 'available', priceMinor: 1000, pledgedMinor: 400 }),
    ];
    render(<ItemFilter items={items} value="all" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'All · 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Available · 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchased or funded · 1' })).toBeInTheDocument();
  });

  it('marks only the chosen filter pressed and calls onChange with it', async () => {
    const onChange = vi.fn();
    render(<ItemFilter items={[item({ status: 'held' })]} value="held" onChange={onChange} />);

    const group = screen.getByRole('group', { name: 'Show gifts' });
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Held · 1' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Available · 0' }));
    expect(onChange).toHaveBeenCalledWith('available');
  });

  it('shows a seal only on Held and Purchased or funded', () => {
    const { container } = render(<ItemFilter items={[]} value="all" onChange={() => {}} />);

    const sealed = (name: string) => screen.getByRole('button', { name }).querySelector('[data-seal]');
    expect(sealed('All · 0')).toBeNull();
    expect(sealed('Available · 0')).toBeNull();
    expect(sealed('Held · 0')).toHaveAttribute('data-seal', 'red-wax');
    expect(sealed('Purchased or funded · 0')).toHaveAttribute('data-seal', 'gold-wax');
    expect(container.querySelectorAll('[data-seal]')).toHaveLength(2);
  });
});
