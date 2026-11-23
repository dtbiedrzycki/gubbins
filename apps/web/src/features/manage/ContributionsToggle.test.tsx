import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContributionsToggle, type ContributionsToggleProps } from './ContributionsToggle';

const renderBox = (over: Partial<ContributionsToggleProps>) =>
  render(<ContributionsToggle revealed={false} loading={false} error={null} onShow={vi.fn()} onHide={vi.fn()} {...over} />);

describe('ContributionsToggle', () => {
  it('warns about spoilers and offers to show the details while hidden', () => {
    renderBox({});
    expect(screen.getByText('Who gave what is hidden.')).toBeInTheDocument();
    expect(screen.getByText("Spoilers: this shows every guest's name and message, for all gifts.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show who gave what' })).toBeEnabled();
  });

  it('says the details are showing and offers Hide once revealed, without the warning', () => {
    renderBox({ revealed: true });
    expect(screen.getByText('Showing who gave what.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
    expect(screen.queryByText(/^Spoilers:/)).not.toBeInTheDocument();
  });

  it('ignores presses on a focusable Showing… button while the details load', async () => {
    const onShow = vi.fn();
    renderBox({ loading: true, onShow });
    const button = screen.getByRole('button', { name: 'Showing…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onShow).not.toHaveBeenCalled();
  });

  it('shows the error in an alert when the details fail to load', () => {
    renderBox({ error: new Error('Network down') });
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t show who gave what. Something went wrong on our end. Wait a moment, then try again.');
  });
});
