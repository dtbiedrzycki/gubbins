import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HoldDialog, type HoldDialogProps } from './HoldDialog';
import { ApiError } from '../../api/client';

function renderDialog(overrides: Partial<HoldDialogProps> = {}) {
  const props: HoldDialogProps = {
    itemTitle: 'Stroller', holdDurationDays: 3, availableUnits: 1, isPending: false, error: null,
    onConfirm: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  return { props, ...render(<HoldDialog {...props} />) };
}

describe('HoldDialog', () => {
  it('tells the guest to come back and mark it purchased, or the hold ends after 3 days', () => {
    renderDialog();
    expect(screen.getByText("Other guests will see it\u2019s taken while you buy it.")).toBeInTheDocument();
    expect(screen.getByText('After you buy it, come back and tap \u201cMark as purchased\u201d.')).toBeInTheDocument();
    expect(screen.getByText('If you don\u2019t, the hold ends after 3 days and another guest could buy it too.')).toBeInTheDocument();
  });

  it('starts with the gifter names last used on this device', () => {
    localStorage.setItem('gubbins.gifterNames', 'Sam & Alex Smith');
    renderDialog();
    expect(screen.getByLabelText('Gifter name(s)')).toHaveValue('Sam & Alex Smith');
  });

  it('says "1 day", not "1 days"', () => {
    renderDialog({ holdDurationDays: 1 });
    expect(screen.getByText(/the hold ends after 1 day and/)).toBeInTheDocument();
  });

  it('confirms with the same key however many times it is tapped while open', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    const [[first], [second]] = vi.mocked(props.onConfirm).mock.calls;
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('cannot confirm until a non-blank name is typed', async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole('button', { name: 'Yes, hold it' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Gifter name(s)'), '   ');
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    expect(confirm).toBeEnabled();
  });

  it('remembers the names once the name field loses focus', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Sam & Alex');
    await user.tab();

    expect(localStorage.getItem('gubbins.gifterNames')).toBe('Sam & Alex');
  });

  it('remembers the names when the dialog is escaped', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Sam & Alex');
    screen.getByRole('dialog', { hidden: true }).dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(localStorage.getItem('gubbins.gifterNames')).toBe('Sam & Alex');
  });

  it('remembers the names when a button is pressed, even without holding', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Sam & Alex');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(localStorage.getItem('gubbins.gifterNames')).toBe('Sam & Alex');
  });

  it('confirms with the trimmed name and message', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), '  Amara ');
    await user.type(screen.getByLabelText('Message to the owner (optional)'), ' Happy to collect Friday ');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(props.onConfirm).toHaveBeenCalledWith(expect.anything(), { name: 'Amara', message: 'Happy to collect Friday', units: 1 });
  });

  it('locks the name and message once sent, so a retry sends what was sent', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amra');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'a');
    await user.type(screen.getByLabelText('Message to the owner (optional)'), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(vi.mocked(props.onConfirm).mock.calls[1][1]).toEqual({ name: 'Amra', message: '', units: 1 });
    expect(screen.getByLabelText('Gifter name(s)')).toHaveAccessibleDescription('Include everyone the gift is from, e.g. Sam & Alex Smith. Names are only shared with the list owner. To change your details, cancel and start again.');
    expect(screen.getByLabelText('Message to the owner (optional)')).toHaveAccessibleDescription('To change your details, cancel and start again.');
  });

  it('limits the gifter names to 100 characters and the message to 300', () => {
    renderDialog();
    expect(screen.getByLabelText('Gifter name(s)')).toHaveAttribute('maxlength', '100');
    expect(screen.getByLabelText('Message to the owner (optional)')).toHaveAttribute('maxlength', '300');
  });

  it('marks the gifter names as required and describes them with the hint and the privacy line', () => {
    renderDialog();
    const name = screen.getByLabelText('Gifter name(s)');
    expect(name).toBeRequired();
    expect(name).toHaveAccessibleDescription('Include everyone the gift is from, e.g. Sam & Alex Smith. Names are only shared with the list owner.');
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

  it('shows no stepper when 1 unit is available', () => {
    renderDialog({ availableUnits: 1 });
    expect(screen.queryByRole('group', { name: 'How many?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, hold it' })).toBeInTheDocument();
  });

  it('holds 2 units and says "Yes, hold 2"', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ availableUnits: 5 });
    expect(screen.getByRole('group', { name: 'How many?' })).toHaveAccessibleDescription('of 5 left');

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold 2' }));

    expect(screen.getByText('Other guests will see they\u2019re taken while you buy them.')).toBeInTheDocument();
    expect(screen.getByText('After you buy them, come back and tap \u201cMark as purchased\u201d.')).toBeInTheDocument();
    expect(screen.getByText('If you don\u2019t, the hold ends after 3 days and another guest could buy them too.')).toBeInTheDocument();
    expect(props.onConfirm).toHaveBeenCalledWith(expect.anything(), { name: 'Amara', message: '', units: 2 });
  });

  it('locks the count once the hold is sent', async () => {
    const user = userEvent.setup();
    renderDialog({ availableUnits: 5 });

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold 2' }));

    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled();
  });

  it('after a 409 with 1 left, says "Only 1 left now." and lets the guest confirm again', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ availableUnits: 3 });
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold 2' }));

    rerender(<HoldDialog {...props} availableUnits={1} error={new ApiError(409, 'This item is no longer available.', 'item_unavailable')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Only 1 left now.');
    expect(screen.queryByRole('group', { name: 'How many?' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Gifter name(s)'), ' Okafor');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    const [[first], [credential, details]] = vi.mocked(props.onConfirm).mock.calls;
    expect(credential.idempotencyKey).toBe(first.idempotencyKey);
    expect(details).toEqual({ name: 'Amara Okafor', message: '', units: 1 });
  });
});
