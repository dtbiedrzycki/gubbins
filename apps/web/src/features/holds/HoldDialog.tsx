import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useHoldCredential, type HoldCredential } from './useHoldCredential';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';
import { Stepper } from '../../lib/Stepper';
import { ApiError } from '../../api/client';
import { readGifterNames, writeGifterNames } from '../../lib/gifterNames';

/** The longest name and message the API takes. */
const NAME_MAX = 100;
const MESSAGE_MAX = 300;

export interface HoldDialogProps {
  itemTitle: string;
  holdDurationDays: number;
  /** Units free right now; the count is capped here, and asked for only when more than one is free. */
  availableUnits: number;
  isPending: boolean;
  error: Error | null;
  onConfirm: (credential: HoldCredential, details: { name: string; message: string; units: number }) => void;
  onClose: () => void;
}

/**
 * A real <dialog> (ADR-0024), mounted only while open: opening it is what
 * mints the hold's credential, so a guest who taps "Yes, hold it" twice on
 * slow venue wifi sends one key twice and gets one hold. The first send locks
 * the name, message and count, so a retry carries exactly what the key was first
 * sent with; the server would keep the first details anyway. It cannot be
 * dismissed while the hold is in flight, so the outcome lands where the
 * guest is looking.
 */
export function HoldDialog({ itemTitle, holdDurationDays, availableUnits, isPending, error, onConfirm, onClose }: HoldDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const credential = useHoldCredential();
  const [name, setName] = useState(readGifterNames);
  const [message, setMessage] = useState('');
  const [units, setUnits] = useState(1);
  const [sent, setSent] = useState(false);
  // A refused hold records nothing, so the same key can be sent again with new details.
  const tooFew = error instanceof ApiError && error.code === 'item_unavailable' && availableUnits >= 1;
  const locked = sent && !tooFew;
  // The list refetches after a failed hold, so fewer may be free than were picked;
  // a locked count stays as sent, so a retry carries it.
  if (!locked && units > availableUnits && availableUnits >= 1) setUnits(availableUnits);

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
    writeGifterNames(name); // Escape can close the dialog without the name field ever losing focus
    if (isPending) event.preventDefault();
  }

  // Chrome won't let a page refuse a second Escape in a row, so a close can
  // still arrive mid-flight: reopen, so the outcome is not lost.
  function handleClose() {
    if (isPending) show();
    else onClose();
  }

  const pronoun = units > 1 ? 'them' : 'it';
  const duration = `${holdDurationDays} ${holdDurationDays === 1 ? 'day' : 'days'}`;

  return (
    <dialog ref={dialogRef} onCancel={handleCancel} onClose={handleClose} aria-labelledby="hold-dialog-title" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[22px] bg-paper p-6 text-ink backdrop:bg-ink/50">
      <p id="hold-dialog-title" className="mb-2 break-words font-display text-[1.3rem] leading-tight">Hold &ldquo;{itemTitle}&rdquo; for yourself?</p>
      <p className="mb-4 text-muted">Other guests will see {units > 1 ? <>they&rsquo;re taken while you buy them</> : <>it&rsquo;s taken while you buy it</>}.</p>
      {availableUnits > 1 && (
        <div className="mb-4 flex items-end gap-2">
          <Stepper id="hold-units" label="How many?" value={units} min={1} max={availableUnits} onChange={setUnits} disabled={isPending || locked} describedBy="hold-units-left" />
          <p id="hold-units-left" className="pb-2.5 text-sm text-muted">of {availableUnits} left</p>
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
      <label className="mb-1 block" htmlFor="hold-message">Message to the owner (optional)</label>
      <LimitedTextarea id="hold-message" value={message} onChange={(e) => setMessage(e.target.value)} max={MESSAGE_MAX} disabled={isPending} readOnly={locked} describedBy={[locked && 'hold-details-locked']} className="field mb-4" />
      {locked && <p id="hold-details-locked" className="mb-4 text-sm text-muted">To change your details, cancel and start again.</p>}
      <p role="alert" className="mb-4 text-error empty:mb-0">{tooFew ? `Only ${availableUnits} left now.` : error?.message}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setSent(true); onConfirm(credential, { name: name.trim(), message: message.trim(), units }); }} disabled={isPending || !name.trim()} className="btn-primary">
          {isPending ? 'Holding…' : `Yes, hold ${units > 1 ? units : 'it'}`}
        </button>
        <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary">
          Cancel
        </button>
      </div>
    </dialog>
  );
}
