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

  it('confirms with the trimmed name', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), '  Amara ');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(props.onConfirm).toHaveBeenCalledWith(expect.anything(), { name: 'Amara', units: 1 });
  });

  it('locks the name once sent, so a retry sends what was sent', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amra');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    await user.type(screen.getByLabelText('Gifter name(s)'), 'a');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    expect(vi.mocked(props.onConfirm).mock.calls[1][1]).toEqual({ name: 'Amra', units: 1 });
    expect(screen.getByLabelText('Gifter name(s)')).toHaveAccessibleDescription('Include everyone the gift is from, e.g. Sam & Alex Smith. Names are only shared with the list owner. To change your details, cancel and start again.');
  });

  it('limits the gifter names to 100 characters', () => {
    renderDialog();
    expect(screen.getByLabelText('Gifter name(s)')).toHaveAttribute('maxlength', '100');
  });

  it('marks the gifter names as required and describes them with the hint and the privacy line', () => {
    renderDialog();
    const name = screen.getByLabelText('Gifter name(s)');
    expect(name).toBeRequired();
    expect(name).toHaveAccessibleDescription('Include everyone the gift is from, e.g. Sam & Alex Smith. Names are only shared with the list owner.');
  });

  it('disables Cancel and confirm while the hold is in flight', () => {
    renderDialog({ isPending: true });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Holding…' })).toBeDisabled();
  });

  it('shows a failed hold in the alert region already in the dialog', () => {
    const { props, rerender } = renderDialog();
    // Screen readers miss a live region that arrives already holding its text.
    const alert = screen.getByRole('alert');
    expect(alert).toBeEmptyDOMElement();

    rerender(<HoldDialog {...props} error={new ApiError(409, 'This item is no longer available.')} />);

    expect(screen.getByRole('alert')).toBe(alert);
    expect(alert).toHaveTextContent('This item is no longer available.');
  });

  it('tells the guest a server failure was on our end, led by what could not be done', () => {
    renderDialog({ error: new ApiError(500, 'Internal server error') });

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn’t hold Stroller. Something went wrong on our end.");
  });

  it('holds 2 of 2 units, no more, and says "Yes, hold 2"', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ availableUnits: 2 });
    expect(screen.getByRole('group', { name: 'How many?' })).toHaveAccessibleDescription('of 2 wanted');

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByRole('button', { name: 'One more' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Yes, hold 2' }));

    expect(screen.getByText('Other guests will see they\u2019re taken while you buy them.')).toBeInTheDocument();
    expect(screen.getByText('After you buy them, come back and tap \u201cMark as purchased\u201d.')).toBeInTheDocument();
    expect(screen.getByText('If you don\u2019t, the hold ends after 3 days and another guest could buy them too.')).toBeInTheDocument();
    expect(props.onConfirm).toHaveBeenCalledWith(expect.anything(), { name: 'Amara', units: 2 });
  });

  it('locks the count once the hold is sent, even when fewer are free by the retry', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ availableUnits: 5 });

    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold 3' }));

    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled();

    rerender(<HoldDialog {...props} availableUnits={2} error={new Error('Network error')} />);
    await user.click(screen.getByRole('button', { name: 'Yes, hold 3' }));

    expect(vi.mocked(props.onConfirm).mock.calls[1][1]).toEqual({ name: 'Amara', units: 3 });
  });

  it('after a 409 that is not about units, shows the server\u2019s message and keeps the details locked', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ availableUnits: 5 });
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));

    rerender(<HoldDialog {...props} error={new ApiError(409, 'Someone else changed this at the same moment. Please try again.')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Someone else changed this at the same moment. Please try again.');
    expect(screen.getByLabelText('Gifter name(s)')).toHaveAttribute('readonly');
  });

  it('after a 409 with 1 still wanted, says "Only 1 still wanted now." and lets the guest confirm again', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ availableUnits: 3 });
    await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
    await user.click(screen.getByRole('button', { name: 'One more' }));
    await user.click(screen.getByRole('button', { name: 'Yes, hold 2' }));

    rerender(<HoldDialog {...props} availableUnits={1} error={new ApiError(409, 'This item is no longer available.', 'item_unavailable')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Only 1 still wanted now.');
    expect(screen.queryByRole('group', { name: 'How many?' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Gifter name(s)'), ' Okafor');
    await user.click(screen.getByRole('button', { name: 'Yes, hold it' }));
    const [[first], [credential, details]] = vi.mocked(props.onConfirm).mock.calls;
    expect(credential.idempotencyKey).toBe(first.idempotencyKey);
    expect(details).toEqual({ name: 'Amara Okafor', units: 1 });
  });

  describe('in buy mode', () => {
    const buy = (overrides: Partial<HoldDialogProps> = {}) => renderDialog({ mode: 'buy', ...overrides });

    it('asks "Buying \u201cStroller\u201d?" in buy mode', () => {
      buy();
      expect(screen.getByRole('dialog', { hidden: true })).toHaveAccessibleName('Buying \u201cStroller\u201d?');
    });

    it('tells the guest to tap "Yes, I\u2019m buying it" before buying, and that it can\u2019t be undone', () => {
      buy();
      expect(screen.getByText('Tap \u201cYes, I\u2019m buying it\u201d before you buy it.')).toBeInTheDocument();
      expect(screen.getByText('Other guests will then see it\u2019s taken, so no one else buys it while you\u2019re getting it. It can\u2019t be undone, so only tap it if you\u2019re sure.')).toBeInTheDocument();
    });

    it('leaves out the hold sheet\u2019s come-back note in buy mode', () => {
      buy();
      expect(screen.queryByText(/come back and tap \u201cMark as purchased\u201d/)).not.toBeInTheDocument();
    });

    it('quotes "Yes, I\u2019m buying 2" in the note with 2 picked', async () => {
      const user = userEvent.setup();
      buy({ availableUnits: 5 });
      await user.click(screen.getByRole('button', { name: 'One more' }));
      expect(screen.getByText('Tap \u201cYes, I\u2019m buying 2\u201d before you buy them.')).toBeInTheDocument();
      expect(screen.getByText('Other guests will then see they\u2019re taken, so no one else buys them while you\u2019re getting them. It can\u2019t be undone, so only tap it if you\u2019re sure.')).toBeInTheDocument();
    });

    it('reads "Yes, I\u2019m buying 2" on the confirm button with 2 picked', async () => {
      const user = userEvent.setup();
      buy({ availableUnits: 5 });
      await user.click(screen.getByRole('button', { name: 'One more' }));
      expect(screen.getByRole('button', { name: 'Yes, I\u2019m buying 2' })).toBeInTheDocument();
    });

    it('sends the trimmed message with the details in buy mode', async () => {
      const user = userEvent.setup();
      const { props } = buy();
      await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
      await user.type(screen.getByLabelText('Message to the owner (optional)'), '  See you Saturday  ');
      await user.click(screen.getByRole('button', { name: 'Yes, I\u2019m buying it' }));

      expect(props.onConfirm).toHaveBeenCalledWith(expect.anything(), { name: 'Amara', units: 1, message: 'See you Saturday' });
    });

    it('locks the message with the name once sent, so a retry sends what was sent', async () => {
      const user = userEvent.setup();
      const { props } = buy();
      await user.type(screen.getByLabelText('Gifter name(s)'), 'Amara');
      await user.type(screen.getByLabelText('Message to the owner (optional)'), 'Enjoy');
      await user.click(screen.getByRole('button', { name: 'Yes, I\u2019m buying it' }));
      await user.type(screen.getByLabelText('Message to the owner (optional)'), '!');
      await user.click(screen.getByRole('button', { name: 'Yes, I\u2019m buying it' }));

      expect(vi.mocked(props.onConfirm).mock.calls[1][1]).toEqual({ name: 'Amara', units: 1, message: 'Enjoy' });
    });

    it('limits the message to 300 characters', () => {
      buy();
      expect(screen.getByLabelText('Message to the owner (optional)')).toHaveAttribute('maxlength', '300');
    });

    it('reads "Saving\u2026" on the confirm button while a purchase is in flight', () => {
      buy({ isPending: true });
      expect(screen.getByRole('button', { name: 'Saving\u2026' })).toBeDisabled();
    });

    it('tells the guest a failed purchase was on our end, led by "Couldn\u2019t buy Stroller."', () => {
      buy({ error: new ApiError(500, 'Internal server error') });
      expect(screen.getByRole('alert')).toHaveTextContent('Couldn\u2019t buy Stroller. Something went wrong on our end.');
    });
  });
});
