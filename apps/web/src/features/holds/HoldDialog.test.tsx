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

  it('confirms with the trimmed name and message', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), '  Amara ');
    await user.type(screen.getByLabelText('Message to the owner (optional)'), ' Happy to collect Friday ');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(props.onConfirm).toHaveBeenCalledWith(expect.anything(), { name: 'Amara', message: 'Happy to collect Friday' });
  });

  it('locks the name and message once sent, so a retry sends what was sent', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amra');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'a');
    await user.type(screen.getByLabelText('Message to the owner (optional)'), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(vi.mocked(props.onConfirm).mock.calls[1][1]).toEqual({ name: 'Amra', message: '' });
    expect(screen.getByLabelText('Gifter name(s)')).toHaveAccessibleDescription('Include everyone the gift is from, e.g. Sam & Alex Smith. Names are only shared with the list owner. To change your details, cancel and start again.');
    expect(screen.getByLabelText('Message to the owner (optional)')).toHaveAccessibleDescription('To change your details, cancel and start again.');
  });

  it('limits the name to 100 characters and the message to 300', () => {
    renderDialog();
    expect(screen.getByLabelText('Gifter name(s)')).toHaveAttribute('maxlength', '100');
    expect(screen.getByLabelText('Message to the owner (optional)')).toHaveAttribute('maxlength', '300');
  });

  it('marks the name as required and asks for everyone the gift is from, with the privacy line', () => {
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
});
