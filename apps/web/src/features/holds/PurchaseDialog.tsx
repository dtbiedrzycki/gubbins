import { useState } from 'react';
import type { HoldView } from '@gubbins/shared-types';
import { LimitedTextarea } from '../../lib/LimitedField';
import { Stepper } from '../../lib/Stepper';
import { ApiError } from '../../api/client';
import { useModalDialog } from '../../lib/useModalDialog';

/** The longest message the API takes. */
const MESSAGE_MAX = 300;

export interface PurchaseDialogProps {
  itemTitle: string;
  status: HoldView['status'];
  units: number;
  /** Units that can still be marked as purchased; the count starts here and is capped here. */
  purchasableUnits: number;
  isPending: boolean;
  error: Error | null;
  /** The message goes as typed; the server trims it. */
  onConfirm: (units: number, message: string) => void;
  onClose: () => void;
}

/**
 * "How many did you buy?" for a hold of more than one unit, or
 * "Mark “{item}” as purchased?" for one, each with the optional message to
 * the owner. A real <dialog> (ADR-0024), mounted only while open, and like
 * HoldDialog it cannot be dismissed while the purchase is in flight, so the
 * outcome lands where the guest is looking.
 */
export function PurchaseDialog({ itemTitle, status, units, purchasableUnits, isPending, error, onConfirm, onClose }: PurchaseDialogProps) {
  const [count, setCount] = useState(purchasableUnits);
  const [message, setMessage] = useState('');
  // The list refetches after a refused purchase, so fewer may be free than were picked.
  if (count > purchasableUnits && purchasableUnits >= 1) setCount(purchasableUnits);
  const released = units - count;
  const capNote = `Only ${purchasableUnits} ${purchasableUnits === 1 ? 'is' : 'are'} still free to mark as purchased.`;
  // A 409 that re-capped the sheet is told as the new cap, not as "no longer available" beside an offer to buy.
  const recapped = error instanceof ApiError && error.code === 'item_unavailable' && purchasableUnits >= 1;

  const { ref, onCancel, onClose: handleClose } = useModalDialog({ isPending, onClose });

  return (
    <dialog ref={ref} onCancel={onCancel} onClose={handleClose} aria-labelledby="purchase-units-label" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[22px] bg-paper p-6 text-ink backdrop:bg-ink/50">
      {/* The one-unit title reuses the Stepper's label id, so the dialog is named by whichever title shows. */}
      {units > 1 ? (
        <div className="mb-4 flex items-end gap-2">
          <Stepper id="purchase-units" label="How many did you buy?" labelClassName="mb-3 font-display text-[1.3rem] leading-tight" value={count} min={1} max={purchasableUnits} onChange={setCount} disabled={isPending} describedBy="purchase-units-held" />
          <p id="purchase-units-held" className="pb-2.5 text-sm text-muted">of {units} held</p>
        </div>
      ) : (
        <p id="purchase-units-label" className="mb-4 break-words font-display text-[1.3rem] leading-tight">Mark {'\u201c'}{itemTitle}{'\u201d'} as purchased?</p>
      )}
      {/* An expired hold's other units were freed when it lapsed, so only an active hold releases any. */}
      {status === 'active' && released > 0 && (
        <p className="mb-4 rounded-[18px] border-[1.5px] border-line bg-white p-4 text-sm font-bold">
          The other {released} will be released, so another guest can hold {released > 1 ? 'them' : 'it'}.
        </p>
      )}
      {status === 'expired' && purchasableUnits < units && !recapped && <p className="mb-4">{capNote}</p>}
      <label className="mb-1 block" htmlFor="purchase-message">Message to the owner (optional)</label>
      <LimitedTextarea id="purchase-message" value={message} onChange={(e) => setMessage(e.target.value)} max={MESSAGE_MAX} disabled={isPending} className="field mb-4" />
      <p role="alert" className="mb-4 text-error empty:mb-0">{recapped ? capNote : error?.message}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onConfirm(count, message)} disabled={isPending} className="btn-primary">
          {units > 1 ? `Mark ${count} as purchased` : 'Mark as purchased'}
        </button>
        <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
