import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { HoldView } from '@gubbins/shared-types';
import { useHoldAction, type HoldAction } from './useHoldAction';
import { formatExpiry } from './formatExpiry';
import { PurchaseDialog } from './PurchaseDialog';
import { ApiError } from '../../api/client';

export interface HoldActionsProps {
  slug: string;
  hold: HoldView;
  itemTitle: string;
  /** An action was started: earlier feedback no longer applies. */
  onStart: () => void;
  onOutcome: (outcome: HoldOutcome) => void;
}

export interface HoldOutcome {
  action: HoldAction;
  ok: boolean;
  message: string;
}

const primary = 'btn-primary';
const secondary = 'btn-secondary';

// The API answers a generic 404 for an unknown hold, another session's hold
// or a lapsed session alike; a reload shows which (the key gate, or the list).
function failureMessage(error: Error): string {
  return error instanceof ApiError && error.status === 404
    ? "We couldn't find this hold. Reload the page to see your holds."
    : error.message;
}

/**
 * The buttons one hold offers — exactly the server's `actions`, never
 * re-derived here, so the client cannot disagree with the rules it enforces.
 * While any action on the hold is in flight, every button is disabled, so a
 * double tap on slow wifi sends one request. Outcomes go up to the caller,
 * because a refetch can remove this hold, and these buttons with it.
 */
export function HoldActions({ slug, hold, itemTitle, onStart, onOutcome }: HoldActionsProps) {
  const failed = (action: HoldAction) => (error: Error) => onOutcome({ action, ok: false, message: failureMessage(error) });
  const extend = useHoldAction(slug, 'extend', {
    onSuccess: (view) => onOutcome({ action: 'extend', ok: true, message: `Hold extended until ${formatExpiry(view.expiresAt)}.` }),
    onError: failed('extend'),
  });
  const release = useHoldAction(slug, 'release', {
    onSuccess: () => onOutcome({ action: 'release', ok: true, message: `Your hold on ${itemTitle} is released.` }),
    onError: failed('release'),
  });
  const [purchaseSheetOpen, setPurchaseSheetOpen] = useState(false);
  const purchaseButton = useRef<HTMLButtonElement>(null);
  const purchase = useHoldAction(slug, 'purchase', {
    onSuccess: (view) => {
      // The modal makes the page inert, so it must be gone before the outcome moves focus.
      flushSync(() => setPurchaseSheetOpen(false));
      onOutcome({ action: 'purchase', ok: true, message: hold.units > 1 ? `${itemTitle}: ${view.purchasedUnits} marked as purchased. Thank you!` : `${itemTitle} is marked as purchased. Thank you!` });
    },
    // The sheet stays open to retry with the refetched limit; the outcome
    // still goes up, in case the refetch shows nothing is left to buy.
    onError: failed('purchase'),
  });
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const releaseQuestion = useRef<HTMLParagraphElement>(null);
  const confirmToggled = useRef(false);

  // The button the guest pressed is replaced, so focus would fall to <body>:
  // move it into the question, and back to Release when they keep the hold.
  useEffect(() => {
    if (!confirmToggled.current) return;
    (confirmingRelease ? keepButton : releaseButton).current?.focus();
  }, [confirmingRelease]);

  function toggleConfirmRelease(next: boolean) {
    confirmToggled.current = true;
    setConfirmingRelease(next);
  }

  const mutations = [extend, release, purchase];
  const pending = mutations.some((m) => m.isPending);

  const { holdId } = hold;

  function buy(units: number) {
    onStart();
    purchase.mutate({ holdId, units });
  }

  // Unmounting the dialog skips the browser's own focus return, so it is done here.
  function closePurchaseSheet() {
    flushSync(() => setPurchaseSheetOpen(false));
    // The next opening starts clean: no stale error from this one.
    purchase.reset();
    purchaseButton.current?.focus();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {hold.actions.purchase && (
          <button ref={purchaseButton} type="button" disabled={pending} onClick={() => (hold.units > 1 ? setPurchaseSheetOpen(true) : buy(1))} className={primary}>Mark as purchased</button>
        )}
        {hold.actions.extend && (
          <button type="button" disabled={pending} onClick={() => { onStart(); extend.mutate({ holdId }); }} className={secondary}>Extend hold</button>
        )}
        {hold.actions.release && !confirmingRelease && (
          <button ref={releaseButton} type="button" disabled={pending} onClick={() => toggleConfirmRelease(true)} className={secondary}>Release hold</button>
        )}
      </div>
      {hold.actions.release && confirmingRelease && (
        <div role="group" aria-labelledby={`release-${hold.holdId}`} className="space-y-2 rounded-[14px] border border-line p-3">
          <p ref={releaseQuestion} id={`release-${hold.holdId}`} tabIndex={-1}>Release your hold on {itemTitle}? Someone else will be able to hold it.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => {
              // The question stays up, its buttons disabled, until the outcome
              // moves focus on; the question is what can hold focus till then.
              releaseQuestion.current?.focus();
              onStart();
              release.mutate({ holdId });
            }} className={primary}>
              Yes, release it
            </button>
            <button ref={keepButton} type="button" disabled={pending} onClick={() => toggleConfirmRelease(false)} className={secondary}>Keep my hold</button>
          </div>
        </div>
      )}
      {purchaseSheetOpen && hold.actions.purchase && (
        <PurchaseDialog
          status={hold.status}
          units={hold.units}
          purchasableUnits={hold.purchasableUnits}
          isPending={purchase.isPending}
          error={purchase.error && failureMessage(purchase.error)}
          onConfirm={buy}
          onClose={closePurchaseSheet}
        />
      )}
    </div>
  );
}
