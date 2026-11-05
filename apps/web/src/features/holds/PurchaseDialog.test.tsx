import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseDialog, type PurchaseDialogProps } from './PurchaseDialog';

function renderDialog(overrides: Partial<PurchaseDialogProps> = {}) {
  const props: PurchaseDialogProps = {
    status: 'active', units: 2, purchasableUnits: 2, isPending: false, error: null,
    onConfirm: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  return { props, ...render(<PurchaseDialog {...props} />) };
}

describe('PurchaseDialog', () => {
  it('starts at 2 of 2 held and says "Mark 2 as purchased"', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    const stepper = screen.getByRole('group', { name: 'How many did you buy?' });
    expect(stepper).toHaveTextContent('2');
    expect(stepper).toHaveAccessibleDescription('of 2 held');
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Mark 2 as purchased' }));

    expect(props.onConfirm).toHaveBeenCalledWith(2);
    expect(screen.queryByText(/will be released/)).not.toBeInTheDocument();
  });

  it('warns that the other 1 will be released when lowered to 1', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'One fewer' }));

    expect(screen.getByText('The other 1 will be released, so another guest can hold it.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark 1 as purchased' }));
    expect(props.onConfirm).toHaveBeenCalledWith(1);
  });

  it('says "them" when more than one will be released', async () => {
    const user = userEvent.setup();
    renderDialog({ units: 3, purchasableUnits: 3 });

    await user.click(screen.getByRole('button', { name: 'One fewer' }));
    await user.click(screen.getByRole('button', { name: 'One fewer' }));

    expect(screen.getByText('The other 2 will be released, so another guest can hold them.')).toBeInTheDocument();
  });

  it('on an expired hold with 1 still free, caps at 1 and shows no release note', () => {
    renderDialog({ status: 'expired', purchasableUnits: 1 });

    expect(screen.getByRole('group', { name: 'How many did you buy?' })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled();
    expect(screen.getByText('Only 1 is still free to mark as purchased.')).toBeInTheDocument();
    expect(screen.queryByText(/will be released/)).not.toBeInTheDocument();
  });

  it('lowers the count to the new cap when fewer become free while it is open', () => {
    const { props, rerender } = renderDialog({ status: 'expired', units: 3, purchasableUnits: 3 });

    rerender(<PurchaseDialog {...props} purchasableUnits={1} error="This item is no longer available." />);

    expect(screen.getByRole('group', { name: 'How many did you buy?' })).toHaveTextContent('1');
    expect(screen.getByRole('alert')).toHaveTextContent('This item is no longer available.');
    expect(screen.getByRole('button', { name: 'Mark 1 as purchased' })).toBeEnabled();
  });

  it('cannot be cancelled or escaped while the purchase is in flight', () => {
    renderDialog({ isPending: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mark 2 as purchased' })).toBeDisabled();
    const escape = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('reopens rather than closes if the browser closes it anyway while the purchase is in flight', () => {
    const { props } = renderDialog({ isPending: true });
    const dialog = screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement;

    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));

    expect(props.onClose).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
  });
});
