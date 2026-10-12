import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HoldDialog, type HoldDialogProps } from './HoldDialog';

function renderDialog(overrides: Partial<HoldDialogProps> = {}) {
  const props: HoldDialogProps = {
    itemTitle: 'Stroller', holdDurationDays: 3, isPending: false, error: null,
    onConfirm: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  return { props, ...render(<HoldDialog {...props} />) };
}

describe('HoldDialog', () => {
  it('states the hold duration plainly', () => {
    renderDialog();
    expect(screen.getByText('Held for you for 3 days.')).toBeInTheDocument();
  });

  it('says "1 day", not "1 days"', () => {
    renderDialog({ holdDurationDays: 1 });
    expect(screen.getByText('Held for you for 1 day.')).toBeInTheDocument();
  });

  it('confirms with the same key however many times it is tapped while open', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    const [[first], [second]] = vi.mocked(props.onConfirm).mock.calls;
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('cannot be cancelled or escaped while the hold is in flight', () => {
    renderDialog({ isPending: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Holding…' })).toBeDisabled();
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('reopens rather than closes if the browser closes it anyway while the hold is in flight', () => {
    // Chrome does not let a page refuse a second Escape in a row.
    const { props } = renderDialog({ isPending: true });
    const dialog = screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement;

    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));

    expect(props.onClose).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
  });

  it('can be escaped when nothing is in flight', () => {
    renderDialog();
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  });

  it('shows a failed hold in the alert region already in the dialog', () => {
    const { props, rerender } = renderDialog();
    // Screen readers miss a live region that arrives already holding its text.
    const alert = screen.getByRole('alert');
    expect(alert).toBeEmptyDOMElement();

    rerender(<HoldDialog {...props} error={new Error('This item is no longer available.')} />);

    expect(screen.getByRole('alert')).toBe(alert);
    expect(alert).toHaveTextContent('This item is no longer available.');
  });
});
