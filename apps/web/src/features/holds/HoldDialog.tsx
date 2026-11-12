import { useState } from 'react';
import { useHoldCredential, type HoldCredential } from './useHoldCredential';
import { LimitedInput } from '../../lib/LimitedField';
import { Stepper } from '../../lib/Stepper';
import { ApiError } from '../../api/client';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { readGifterNames, writeGifterNames } from '../../lib/gifterNames';
import { useModalDialog } from '../../lib/useModalDialog';

/** The longest name the API takes. */
const NAME_MAX = 100;

export interface HoldDialogProps {
  itemTitle: string;
  holdDurationDays: number;
  /** Units free right now; the count is capped here, and asked for only when more than one is free. */
  availableUnits: number;
  isPending: boolean;
  error: Error | null;
  onConfirm: (credential: HoldCredential, details: { name: string; units: number }) => void;
  onClose: () => void;
}

/**
 * A real <dialog> (ADR-0024), mounted only while open: opening it is what
 * mints the hold's credential, so a guest who taps "Yes, hold it" twice on
 * slow venue wifi sends one key twice and gets one hold. The first send locks
 * the name and count, so a retry carries exactly what the key was first
 * sent with; the server would keep the first details anyway. It cannot be
 * dismissed while the hold is in flight, so the outcome lands where the
 * guest is looking.
 */
export function HoldDialog({ itemTitle, holdDurationDays, availableUnits, isPending, error, onConfirm, onClose }: HoldDialogProps) {
  const credential = useHoldCredential();
  const [name, setName] = useState(readGifterNames);
  const [units, setUnits] = useState(1);
  const [sent, setSent] = useState(false);
  // A refused hold records nothing, so the same key can be sent again with new details.
  const tooFew = error instanceof ApiError && error.code === 'item_unavailable' && availableUnits >= 1;
  const locked = sent && !tooFew;
  // The list refetches after a failed hold, so fewer may be free than were picked;
  // a locked count stays as sent, so a retry carries it.
  if (!locked && units > availableUnits && availableUnits >= 1) setUnits(availableUnits);

  const { ref, onCancel, onClose: handleClose } = useModalDialog({ isPending, onClose });

  const pronoun = units > 1 ? 'them' : 'it';
  const duration = `${holdDurationDays} ${holdDurationDays === 1 ? 'day' : 'days'}`;

  return (
    <dialog ref={ref} onClose={handleClose}
      onCancel={(event) => {
        writeGifterNames(name); // Escape can close the dialog without the name field ever losing focus
        onCancel(event);
      }}
      aria-labelledby="hold-dialog-title" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[22px] bg-paper p-6 text-ink backdrop:bg-ink/50">
      <p id="hold-dialog-title" className="mb-2 break-words font-display text-[1.3rem] leading-tight">Hold &ldquo;{itemTitle}&rdquo; for yourself?</p>
      <p className="mb-4 text-muted">Other guests will see {units > 1 ? <>they&rsquo;re taken while you buy them</> : <>it&rsquo;s taken while you buy it</>}.</p>
      {availableUnits > 1 && (
        <div className="mb-4 flex items-end gap-2">
          <Stepper id="hold-units" label="How many?" value={units} min={1} max={availableUnits} onChange={setUnits} disabled={isPending || locked} describedBy="hold-units-left" />
          <p id="hold-units-left" className="pb-2.5 text-sm text-muted">of {availableUnits} wanted</p>
        </div>
      )}
      <div className="mb-4 space-y-2 rounded-[18px] border-[1.5px] border-line bg-white p-4">
        <p className="font-bold">After you buy {pronoun}, come back and tap &ldquo;Mark as purchased&rdquo;.</p>
        <p>If you don&rsquo;t, the hold ends after {duration} and another guest could buy {pronoun} too.</p>
      </div>
      <label className="mb-1 block" htmlFor="hold-name">Gifter name(s)</label>
      <LimitedInput id="hold-name" required describedBy={['hold-name-hint', 'hold-name-privacy', locked && 'hold-details-locked']} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => writeGifterNames(name)} max={NAME_MAX} disabled={isPending} readOnly={locked} className="field mb-1" />
      <p id="hold-name-hint" className="text-sm text-muted">Include everyone the gift is from, e.g. Sam &amp; Alex Smith.</p>
      <p id="hold-name-privacy" className="mb-4 text-sm text-muted">Names are only shared with the list owner.</p>
      {locked && <p id="hold-details-locked" className="mb-4 text-sm text-muted">To change your details, cancel and start again.</p>}
      <p role="alert" className="mb-4 text-error empty:mb-0">{tooFew ? `Only ${availableUnits} still wanted now.` : error && actionErrorMessage(error, `Couldn’t hold ${itemTitle}.`)}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setSent(true); onConfirm(credential, { name: name.trim(), units }); }} disabled={isPending || !name.trim()} className="btn-primary">
          {isPending ? 'Holding…' : `Yes, hold ${units > 1 ? units : 'it'}`}
        </button>
        <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
