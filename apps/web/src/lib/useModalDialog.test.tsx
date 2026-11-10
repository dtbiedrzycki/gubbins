import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useModalDialog } from './useModalDialog';

function Sheet({ isPending, onClose }: { isPending: boolean; onClose: () => void }) {
  const { ref, onCancel, onClose: handleClose } = useModalDialog({ isPending, onClose });
  return <dialog ref={ref} onCancel={onCancel} onClose={handleClose} aria-label="Sheet" />;
}

function renderSheet(isPending = false) {
  const onClose = vi.fn();
  render(<Sheet isPending={isPending} onClose={onClose} />);
  return { onClose, dialog: screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement };
}

describe('useModalDialog', () => {
  it('opens the dialog when mounted', () => {
    // jsdom can't tell modal from open, so this only protects that it opens.
    expect(renderSheet().dialog.open).toBe(true);
  });

  it('refuses Escape while the request is in flight', () => {
    const { dialog } = renderSheet(true);
    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('reopens rather than closes if the browser closes it anyway while in flight', () => {
    const { dialog, onClose } = renderSheet(true);
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
  });

  it('calls onClose when closed with nothing in flight', () => {
    const { dialog, onClose } = renderSheet();
    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
