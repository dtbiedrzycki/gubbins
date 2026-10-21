import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ListViewResponse, PledgeRequest } from '@gubbins/shared-types';
import { api } from '../../api/client';
import { listViewKey } from '../holds/useListView';
import { formatMoney } from '../../lib/formatMoney';
import { parseUsd } from '../../lib/parseUsd';
import { venmoAppLink, venmoWebLink } from './paymentLinks';

export interface ContributeDialogProps {
  slug: string;
  itemId: string;
  itemTitle: string;
  remainingMinor: number;
  payment: ListViewResponse['payment'];
  onPledged: (amountMinor: number) => void;
  onClose: () => void;
}

const invalidAmount = 'Enter an amount like 25 or 25.50.';
const button = 'min-h-11 rounded px-4 py-2 disabled:opacity-50';
const field = 'mb-1 min-h-11 w-full rounded border px-2';

/**
 * A real <dialog> (ADR-0024) in the HoldDialog style, mounted only while
 * open: opening it mints the pledge's idempotency key, so a retry on slow
 * wifi records one pledge. The first send locks the amount, name and message,
 * so a retry carries exactly what the key was first sent with; the server
 * would keep the first pledge anyway. It cannot be dismissed while the pledge
 * is in flight.
 */
export function ContributeDialog({ slug, itemId, itemTitle, remainingMinor, payment, onPledged, onClose }: ContributeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<'amount' | 'pay'>('amount');
  const [coverRest, setCoverRest] = useState(false);
  const [other, setOther] = useState('');
  const [amountText, setAmountText] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  const queryClient = useQueryClient();
  const { mutate, isPending, isIdle, error } = useMutation({
    mutationFn: (input: PledgeRequest) => api.pledgeContribution(slug, itemId, input),
    // Settled, not success: a 409 also means the pledged total moved. Returning
    // the promise keeps the mutation pending until the fresh total lands.
    onSettled: () => queryClient.invalidateQueries({ queryKey: listViewKey(slug) }),
  });

  function show() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true; // jsdom test environment only — showModal isn't implemented there
  }
  useEffect(show, []);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (isPending) event.preventDefault();
  }
  // Chrome won't let a page refuse a second Escape in a row: reopen, so the outcome is not lost.
  function handleClose() {
    if (isPending) show();
    else onClose();
  }

  const sent = !isIdle;
  const lockedHint = sent ? 'contribute-locked' : undefined;
  const chosen = coverRest ? remainingMinor : parseUsd(other);
  const amount = parseUsd(amountText);

  function send() {
    if (amount === null || isPending) return;
    mutate(
      { idempotencyKey, amountMinor: amount, name: name.trim(), ...(message.trim() && { message: message.trim() }) },
      { onSuccess: (pledge) => onPledged(pledge.amountMinor) },
    );
  }

  return (
    <dialog ref={dialogRef} onCancel={handleCancel} onClose={handleClose} aria-labelledby="contribute-title" className="w-full max-w-sm rounded-lg p-6 backdrop:bg-black/50">
      <p id="contribute-title" className="mb-4 font-semibold">Chip in toward &ldquo;{itemTitle}&rdquo;</p>
      {step === 'amount' ? (
        <>
          {remainingMinor > 0 && (
            <label className="mb-4 flex min-h-11 items-center gap-2">
              <input type="radio" checked={coverRest} onChange={() => { setCoverRest(true); setOther(''); }} className="size-5" />
              Cover the rest ({formatMoney(remainingMinor)})
            </label>
          )}
          <label className="mb-1 block" htmlFor="contribute-other">Another amount</label>
          <input id="contribute-other" inputMode="decimal" value={other} onChange={(e) => { setOther(e.target.value); setCoverRest(false); }}
            aria-invalid={Boolean(other.trim()) && chosen === null} aria-describedby="contribute-other-error" className={field} />
          <p id="contribute-other-error" className="mb-4 text-sm text-red-600">{other.trim() && chosen === null ? invalidAmount : ''}</p>
          <div className="flex gap-2">
            <button type="button" disabled={chosen === null} onClick={() => { setAmountText((chosen! / 100).toFixed(2)); setStep('pay'); }} className={`${button} bg-slate-900 text-white`}>Continue</button>
            <button type="button" onClick={onClose} className={`${button} border`}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <label className="mb-1 block" htmlFor="contribute-amount">Amount (USD)</label>
          <input id="contribute-amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} disabled={isPending} readOnly={sent}
            aria-invalid={amount === null} aria-describedby={sent ? 'contribute-amount-error contribute-locked' : 'contribute-amount-error'} className={field} />
          <p id="contribute-amount-error" className="mb-4 text-sm text-red-600">{amount === null ? invalidAmount : ''}</p>
          {payment.venmoHandle && amount !== null && (
            <p className="mb-4 flex flex-wrap items-center gap-4">
              <a href={venmoAppLink(payment.venmoHandle, amount, itemTitle)} className={`${button} inline-flex items-center bg-blue-700 text-white`}>Pay {formatMoney(amount)} with Venmo</a>
              <a href={venmoWebLink(payment.venmoHandle)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-blue-700 underline">Venmo website</a>
            </p>
          )}
          {payment.zelleHandle && (
            <p className="mb-4 flex flex-wrap items-center gap-2">
              <span>Zelle: {payment.zelleHandle}</span>
              <button type="button" onClick={() => navigator.clipboard.writeText(payment.zelleHandle!).then(() => setCopied('Copied.'), () => setCopied("Couldn't copy. Select the handle instead."))} className={`${button} border`}>Copy</button>
            </p>
          )}
          <p role="status" aria-live="polite" className="mb-4 text-sm empty:mb-0">{copied}</p>
          <label className="mb-1 block" htmlFor="contribute-name">Your name</label>
          <input id="contribute-name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} disabled={isPending} readOnly={sent} aria-describedby={lockedHint} className={`${field} mb-4`} />
          <label className="mb-1 block" htmlFor="contribute-message">Message to the owner (optional)</label>
          <textarea id="contribute-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} disabled={isPending} readOnly={sent} aria-describedby={lockedHint} className="mb-4 w-full rounded border px-2 py-1" />
          {sent && <p id="contribute-locked" className="mb-4 text-sm text-slate-700">To change your details, cancel and start again.</p>}
          <p role="alert" className="mb-4 text-red-600 empty:mb-0">{error?.message}</p>
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={isPending || amount === null || !name.trim()} className={`${button} bg-slate-900 text-white`}>I&apos;ve sent it</button>
            <button type="button" onClick={onClose} disabled={isPending} className={`${button} border`}>Cancel</button>
          </div>
        </>
      )}
    </dialog>
  );
}
