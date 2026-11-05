import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { HoldView } from '@gubbins/shared-types';
import { Stepper } from '../../lib/Stepper';

export interface PurchaseDialogProps {
  status: HoldView['status'];
  units: number;
  /** Units that can still be marked as purchased; the count starts here and is capped here. */
  purchasableUnits: number;
  isPending: boolean;
  error: string | null;
  onConfirm: (units: number) => void;
  onClose: () => void;
}

/**
 * "How many did you buy?" for a hold of more than one unit. A real <dialog>
 * (ADR-0024), mounted only while open, and like HoldDialog it cannot be
 * dismissed while the purchase is in flight, so the outcome lands where the
 * guest is looking.
 */
export function PurchaseDialog({ status, units, purchasableUnits, isPending, error, onConfirm, onClose }: PurchaseDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [count, setCount] = useState(purchasableUnits);
  // The list refetches after a refused purchase, so fewer may be free than were picked.
  if (count > purchasableUnits && purchasableUnits >= 1) setCount(purchasableUnits);
  const released = units - count;

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

  return (
    <dialog ref={dialogRef} onCancel={handleCancel} onClose={handleClose} aria-labelledby="purchase-units-label" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[22px] bg-paper p-6 text-ink backdrop:bg-ink/50">
      <div className="mb-4 flex items-end gap-2">
        <Stepper id="purchase-units" label="How many did you buy?" labelClassName="mb-3 font-display text-[1.3rem] leading-tight" value={count} min={1} max={purchasableUnits} onChange={setCount} disabled={isPending} describedBy="purchase-units-held" />
        <p id="purchase-units-held" className="pb-2.5 text-sm text-muted">of {units} held</p>
      </div>
      {/* An expired hold's other units were freed when it lapsed, so only an active hold releases any. */}
      {status === 'active' && released > 0 && (
        <p className="mb-4 rounded-[18px] border-[1.5px] border-line bg-white p-4 font-bold">
          The other {released} will be released, so another guest can hold {released > 1 ? 'them' : 'it'}.
        </p>
      )}
      {status === 'expired' && purchasableUnits < units && (
        <p className="mb-4">Only {purchasableUnits} {purchasableUnits === 1 ? 'is' : 'are'} still free to mark as purchased.</p>
      )}
      <p role="alert" className="mb-4 text-error empty:mb-0">{error}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onConfirm(count)} disabled={isPending} className="btn-primary">
          Mark {count} as purchased
        </button>
        <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
