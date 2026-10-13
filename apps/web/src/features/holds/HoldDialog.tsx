import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useHoldCredential, type HoldCredential } from './useHoldCredential';

export interface HoldDialogProps {
  itemTitle: string;
  holdDurationDays: number;
  isPending: boolean;
  error: Error | null;
  onConfirm: (credential: HoldCredential, details: { name: string; message: string }) => void;
  onClose: () => void;
}

/**
 * A real <dialog> (ADR-0024), mounted only while open: opening it is what
 * mints the hold's credential, so a guest who taps "Yes, hold it" twice on
 * slow venue wifi sends one key twice and gets one hold. It cannot be
 * dismissed while the hold is in flight, so the outcome lands where the
 * guest is looking.
 */
export function HoldDialog({ itemTitle, holdDurationDays, isPending, error, onConfirm, onClose }: HoldDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const credential = useHoldCredential();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  function show() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.open = true; // jsdom test environment only — showModal isn't implemented there
    }
  }

  useEffect(show, []);

  // Escape fires `cancel` before the dialog closes; refusing it keeps the
  // dialog up until the request settles.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (isPending) event.preventDefault();
  }

  // Chrome won't let a page refuse a second Escape in a row, so a close can
  // still arrive mid-flight: reopen, so the outcome is not lost.
  function handleClose() {
    if (isPending) show();
    else onClose();
  }

  const duration = `${holdDurationDays} ${holdDurationDays === 1 ? 'day' : 'days'}`;

  return (
    <dialog ref={dialogRef} onCancel={handleCancel} onClose={handleClose} aria-labelledby="hold-dialog-title" className="rounded-lg p-6 backdrop:bg-black/50">
      <p id="hold-dialog-title" className="mb-2">Hold &ldquo;{itemTitle}&rdquo; for yourself?</p>
      <p className="mb-4 text-slate-700">Held for you for {duration}.</p>
      <label className="mb-1 block" htmlFor="hold-name">Your name</label>
      <input id="hold-name" required aria-describedby="hold-name-privacy" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} disabled={isPending} className="mb-1 min-h-11 w-full rounded border px-2" />
      <p id="hold-name-privacy" className="mb-4 text-sm text-slate-700">Your name is only shared with the list owner.</p>
      <label className="mb-1 block" htmlFor="hold-message">Message to the owner (optional)</label>
      <textarea id="hold-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} disabled={isPending} className="mb-4 w-full rounded border px-2 py-1" />
      <p role="alert" className="mb-4 text-red-600 empty:mb-0">{error?.message}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onConfirm(credential, { name: name.trim(), message: message.trim() })} disabled={isPending || !name.trim()} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {isPending ? 'Holding…' : 'Yes, hold it'}
        </button>
        <button type="button" onClick={onClose} disabled={isPending} className="min-h-11 rounded border px-4 py-2 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
