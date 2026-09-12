import { useEffect, useRef } from 'react';

export interface HoldDialogProps {
  itemTitle: string;
  isOpen: boolean;
  isPending: boolean;
  error: Error | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** A real <dialog> — ADR-024: hold sheet and contribute flow use native <dialog>. */
export function HoldDialog({ itemTitle, isOpen, isPending, error, onConfirm, onClose }: HoldDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // jsdom doesn't implement showModal — manually set open attribute for testing
        dialog.open = true;
      }
    }
    if (!isOpen && dialog.open) {
      try {
        dialog.close();
      } catch {
        // jsdom doesn't implement close — manually unset open attribute for testing
        dialog.open = false;
      }
    }
  }, [isOpen]);

  return (
    <dialog ref={dialogRef} onClose={onClose} className="rounded-lg p-6 backdrop:bg-black/50">
      <p className="mb-4">Hold &ldquo;{itemTitle}&rdquo; for yourself?</p>
      {error && <p role="alert" className="mb-4 text-red-600">{error.message}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onConfirm} disabled={isPending} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {isPending ? 'Holding…' : 'Yes, hold it'}
        </button>
        <button type="button" onClick={onClose} className="rounded border px-4 py-2">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
