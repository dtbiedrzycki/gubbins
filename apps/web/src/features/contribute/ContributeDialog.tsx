import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ListViewResponse, PledgeRequest } from '@gubbins/shared-types';
import { api } from '../../api/client';
import { listViewKey } from '../holds/useListView';
import { formatMoney } from '../../lib/formatMoney';
import { parseUsd } from '../../lib/parseUsd';
import { venmoPayLink } from './paymentLinks';
import { readPreferredPayMethod, writePreferredPayMethod, type PayMethod } from './preferredPayMethod';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';

export interface ContributeDialogProps {
  slug: string;
  itemId: string;
  itemTitle: string;
  remainingMinor: number;
  payment: ListViewResponse['payment'];
  onPledged: (amountMinor: number) => void;
  onClose: () => void;
}

/** The longest name and message the API takes. */
const NAME_MAX = 100;
const MESSAGE_MAX = 300;
const invalidAmount = 'Enter an amount like 25 or 25.50.';
const field = 'field mb-1';
const PAY_METHOD_LABEL: Record<PayMethod, string> = { venmo: 'Venmo', zelle: 'Zelle' };

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
  const [chosenMethod, setChosenMethod] = useState<PayMethod | null>(readPreferredPayMethod);
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
  const lockedHint = sent && 'contribute-locked';
  const chosen = coverRest ? remainingMinor : parseUsd(other);
  const amount = parseUsd(amountText);
  const offered: PayMethod[] = [payment.venmoHandle && 'venmo', payment.zelleHandle && 'zelle'].filter((m): m is PayMethod => Boolean(m));
  const method = chosenMethod && offered.includes(chosenMethod) ? chosenMethod : offered.includes('venmo') ? 'venmo' : 'zelle';
  const waysToPay = offered.map((m) => PAY_METHOD_LABEL[m]).join(' or ');

  function send() {
    if (amount === null || isPending) return;
    const trimmedMessage = message.trim();
    mutate(
      { idempotencyKey, amountMinor: amount, name: name.trim(), ...(trimmedMessage && { message: trimmedMessage }) },
      { onSuccess: (pledge) => onPledged(pledge.amountMinor) },
    );
  }

  return (
    <dialog ref={dialogRef} onCancel={handleCancel} onClose={handleClose} aria-labelledby="contribute-title" className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[22px] bg-paper p-6 text-ink backdrop:bg-ink/50">
      <p id="contribute-title" className="mb-4 break-words font-display text-[1.3rem] leading-tight">Chip in toward &ldquo;{itemTitle}&rdquo;</p>
      {step === 'amount' ? (
        <>
          {remainingMinor > 0 && (
            <label className="mb-4 flex min-h-11 items-center gap-2">
              <input type="radio" checked={coverRest} onChange={() => { setCoverRest(true); setOther(''); }} className="size-5 accent-moss" />
              Cover the rest ({formatMoney(remainingMinor)})
            </label>
          )}
          <label className="mb-1 block" htmlFor="contribute-other">Another amount</label>
          <input id="contribute-other" inputMode="decimal" value={other} onChange={(e) => { setOther(e.target.value); setCoverRest(false); }}
            aria-invalid={Boolean(other.trim()) && chosen === null} aria-describedby="contribute-other-error" className={field} />
          <p id="contribute-other-error" className="mb-4 text-sm text-error">{other.trim() && chosen === null ? invalidAmount : ''}</p>
          <div className="flex gap-2">
            <button type="button" disabled={chosen === null} onClick={() => { setAmountText((chosen! / 100).toFixed(2)); setStep('pay'); }} className="btn-primary">Continue</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </>
      ) : (
        <>
          <ol aria-label="How to chip in" className="mb-4 list-decimal pl-5 text-sm">
            <li>Check the amount, then send it with {waysToPay}.</li>
            <li>Once it has gone through, come back to this page.</li>
            <li>Add who the gift is from and choose &ldquo;I&apos;ve sent it&rdquo;, so the list shows the gift.</li>
          </ol>
          <label className="mb-1 block" htmlFor="contribute-amount">Amount (USD)</label>
          <input id="contribute-amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} disabled={isPending} readOnly={sent}
            aria-invalid={amount === null} aria-describedby={sent ? 'contribute-amount-error contribute-locked' : 'contribute-amount-error'} className={field} />
          <p id="contribute-amount-error" className="mb-4 text-sm text-error">{amount === null ? invalidAmount : ''}</p>
          {offered.length > 1 && (
            <fieldset className="mb-4 grid grid-cols-2 rounded-[22px] border-[1.5px] border-ink bg-white p-1">
              <legend className="sr-only">Pay with</legend>
              {offered.map((option) => (
                <label key={option} className="relative grid min-h-11 cursor-pointer place-items-center rounded-[18px] has-checked:bg-ink has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue-500">
                  <input type="radio" name="pay-method" value={option} checked={method === option} className="absolute opacity-0"
                    onChange={() => { setChosenMethod(option); writePreferredPayMethod(option); setCopied(''); }} />
                  {PAY_METHOD_LABEL[option]}
                </label>
              ))}
            </fieldset>
          )}
          {method === 'venmo' && amount !== null && (
            <div className="mb-4">
              <p className="mb-2"><a href={venmoPayLink(payment.venmoHandle!, amount, itemTitle)} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center">Pay {formatMoney(amount)} with Venmo</a></p>
              <p className="text-sm text-muted">Opens Venmo with the payment information pre-filled.</p>
            </div>
          )}
          {method === 'zelle' && (
            <div className="mb-4">
              <ol aria-label="Paying with Zelle" className="mb-2 list-decimal pl-5 text-sm">
                <li>Open your bank&rsquo;s app and choose <strong>Send money with Zelle</strong>.</li>
                <li>Send <strong>{amount === null ? 'the amount' : formatMoney(amount)}</strong> to the handle below.</li>
                <li>Add &ldquo;{itemTitle}&rdquo; as the memo.</li>
              </ol>
              <p className="flex flex-wrap items-center gap-2">
                <strong>{payment.zelleHandle}</strong>
                <button type="button" onClick={() => navigator.clipboard.writeText(payment.zelleHandle!).then(() => setCopied('Copied.'), () => setCopied("Couldn't copy. Select the handle instead."))} className="btn-secondary">Copy</button>
              </p>
            </div>
          )}
          <p role="status" aria-live="polite" className="mb-4 text-sm empty:mb-0">{copied}</p>
          <label className="mb-1 block" htmlFor="contribute-name">Gifter name(s)</label>
          <LimitedInput id="contribute-name" required value={name} onChange={(e) => setName(e.target.value)} max={NAME_MAX} disabled={isPending} readOnly={sent} describedBy={['contribute-name-hint', lockedHint]} className={`${field} mb-1`} />
          <p id="contribute-name-hint" className="mb-4 text-sm text-muted">Include everyone the gift is from, e.g. Sam &amp; Alex Smith.</p>
          <label className="mb-1 block" htmlFor="contribute-message">Message to the owner (optional)</label>
          <LimitedTextarea id="contribute-message" value={message} onChange={(e) => setMessage(e.target.value)} max={MESSAGE_MAX} disabled={isPending} readOnly={sent} describedBy={[lockedHint]} className="field mb-4" />
          {sent && <p id="contribute-locked" className="mb-4 text-sm text-muted">To change your details, cancel and start again.</p>}
          <p role="alert" className="mb-4 text-error empty:mb-0">{error?.message}</p>
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={isPending || amount === null || !name.trim()} className="btn-primary">I&apos;ve sent it</button>
            <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary">Cancel</button>
          </div>
        </>
      )}
    </dialog>
  );
}
