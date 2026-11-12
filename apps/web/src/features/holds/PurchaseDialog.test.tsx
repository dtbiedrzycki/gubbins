import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseDialog, type PurchaseDialogProps } from './PurchaseDialog';
import { ApiError } from '../../api/client';

function renderDialog(overrides: Partial<PurchaseDialogProps> = {}) {
  const props: PurchaseDialogProps = {
    status: 'active', itemTitle: 'Stroller', units: 2, purchasableUnits: 2, isPending: false, error: null,
    onConfirm: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  return { props, ...render(<PurchaseDialog {...props} />) };
}

describe('PurchaseDialog', () => {
  it('tells the guest a server failure was on our end, led by what could not be done', () => {
    renderDialog({ error: new ApiError(500, 'Internal server error') });

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn’t mark Stroller as purchased. Something went wrong on our end.");
  });

  it('hands focus back to the confirm button when a refusal lands and keeps the sheet open', () => {
    const networkFailure = new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
    const { props, rerender } = renderDialog({ units: 1, purchasableUnits: 1, isPending: true });
    // In a browser, the disabled button loses focus while the request is in flight.
    screen.getByLabelText('Message to the owner (optional)').focus();

    rerender(<PurchaseDialog {...props} isPending={false} error={networkFailure} />);

    expect(screen.getByRole('button', { name: 'Mark as purchased' })).toHaveFocus();
  });

  it('leaves focus where the guest moves it after a refusal', async () => {
    const user = userEvent.setup();
    const networkFailure = new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
    renderDialog({ units: 1, purchasableUnits: 1, error: networkFailure });
    const field = screen.getByLabelText('Message to the owner (optional)');

    await user.click(field);
    await user.type(field, 'Congrats');

    expect(field).toHaveFocus();
  });

  it('starts at 2 of 2 held and says "Mark 2 as purchased"', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    const stepper = screen.getByRole('group', { name: 'How many did you buy?' });
    expect(stepper).toHaveTextContent('2');
    expect(stepper).toHaveAccessibleDescription('of 2 held');
    expect(screen.getByRole('button', { name: 'One more' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('button', { name: 'Mark 2 as purchased' }));

    expect(props.onConfirm).toHaveBeenCalledWith(2, '');
    expect(screen.queryByText(/will be released/)).not.toBeInTheDocument();
  });

  it('for one unit held, asks "Mark “Stroller” as purchased?" with no stepper or release note', () => {
    renderDialog({ units: 1, purchasableUnits: 1 });

    expect(screen.getByRole('dialog', { name: 'Mark \u201cStroller\u201d as purchased?' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'How many did you buy?' })).not.toBeInTheDocument();
    expect(screen.queryByText(/will be released/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as purchased' })).toBeInTheDocument();
  });

  it('sends the message with the count', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ units: 1, purchasableUnits: 1 });

    await user.type(screen.getByLabelText('Message to the owner (optional)'), 'Congrats');
    await user.click(screen.getByRole('button', { name: 'Mark as purchased' }));

    expect(props.onConfirm).toHaveBeenCalledWith(1, 'Congrats');
  });

  it('locks the message box while the purchase is in flight', () => {
    renderDialog({ isPending: true });

    expect(screen.getByLabelText('Message to the owner (optional)')).toBeDisabled();
  });

  it('warns that the other 1 will be released when lowered to 1', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'One fewer' }));

    expect(screen.getByText('The other 1 will be released, so another guest can hold it.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark 1 as purchased' }));
    expect(props.onConfirm).toHaveBeenCalledWith(1, '');
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
    expect(screen.getByRole('button', { name: 'One more' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Only 1 is still free to mark as purchased.')).toBeInTheDocument();
    expect(screen.queryByText(/will be released/)).not.toBeInTheDocument();
  });

  it('after a 409 with 1 still free, lowers the count to 1 and says so once, in the alert', () => {
    const { props, rerender } = renderDialog({ status: 'expired', units: 3, purchasableUnits: 3 });

    rerender(<PurchaseDialog {...props} purchasableUnits={1} error={new ApiError(409, 'This item is no longer available.', 'item_unavailable')} />);

    expect(screen.getByRole('group', { name: 'How many did you buy?' })).toHaveTextContent('1');
    expect(screen.getByRole('alert')).toHaveTextContent('Only 1 is still free to mark as purchased.');
    expect(screen.getAllByText('Only 1 is still free to mark as purchased.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Mark 1 as purchased' })).toBeEnabled();
  });

  it('disables Cancel and confirm while the purchase is in flight', () => {
    renderDialog({ isPending: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mark 2 as purchased' })).toBeDisabled();
  });
});
