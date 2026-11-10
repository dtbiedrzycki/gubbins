import { useEffect, useRef, type RefObject, type SyntheticEvent } from 'react';

/**
 * Opens a real <dialog> (ADR-0024) as a modal when it mounts, and keeps it
 * open while a request is in flight so the outcome lands where the guest is
 * looking. Spread `ref`, `onCancel` and `onClose` onto the <dialog>.
 */
export function useModalDialog({ isPending, onClose }: { isPending: boolean; onClose: () => void }): {
  ref: RefObject<HTMLDialogElement | null>;
  onCancel: (event: SyntheticEvent<HTMLDialogElement>) => void;
  onClose: () => void;
} {
  const ref = useRef<HTMLDialogElement>(null);

  function show() {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.open = true; // jsdom test environment only — showModal isn't implemented there
    }
  }

  useEffect(show, []);

  return {
    ref,
    // Escape fires `cancel` before the dialog closes; refusing it keeps the
    // dialog up until the request settles.
    onCancel: (event) => {
      if (isPending) event.preventDefault();
    },
    // Chrome won't let a page refuse a second Escape in a row, so a close can
    // still arrive mid-flight: reopen, so the outcome is not lost.
    onClose: () => {
      if (isPending) show();
      else onClose();
    },
  };
}
